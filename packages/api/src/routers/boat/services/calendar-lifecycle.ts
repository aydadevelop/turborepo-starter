import { db } from "@full-stack-cf-app/db";
import {
	type BoatStatus,
	boatCalendarConnection,
} from "@full-stack-cf-app/db/schema/boat";
import { eq } from "drizzle-orm";

import { getCalendarAdapter } from "../../../calendar/adapters/registry";
import {
	startCalendarConnectionWatch,
	stopCalendarConnectionWatch,
	syncCalendarConnectionById,
} from "../../../calendar/sync/connection-sync";

type BoatCalendarConnection = typeof boatCalendarConnection.$inferSelect;

interface ReconcileBoatCalendarConnectionsParams {
	boatId: string;
	previousStatus: BoatStatus;
	previousIsActive: boolean;
	nextStatus: BoatStatus;
	nextIsActive: boolean;
	webhookUrl?: string;
	webhookChannelToken?: string;
	webhookTtlSeconds?: number;
}

interface DisabledConnectionLifecycleResult {
	connectionId: string;
	provider: string;
	watchStopped: boolean;
	error?: string;
}

interface EnabledConnectionLifecycleResult {
	connectionId: string;
	provider: string;
	watchStarted: boolean;
	syncCompleted: boolean;
	error?: string;
}

const toErrorMessage = (error: unknown) => {
	if (error instanceof Error) {
		return error.message.slice(0, 1900);
	}
	return "Unknown calendar lifecycle error";
};

const canBoatCalendarAutomationRun = (params: {
	status: BoatStatus;
	isActive: boolean;
}) => params.status === "active" && params.isActive;

const hasWatchMetadata = (connection: BoatCalendarConnection) =>
	Boolean(connection.watchChannelId) && Boolean(connection.watchResourceId);

const hasActiveWatch = (
	connection: BoatCalendarConnection,
	activeWatchThreshold: number
) =>
	hasWatchMetadata(connection) &&
	connection.watchExpiresAt instanceof Date &&
	connection.watchExpiresAt.getTime() > activeWatchThreshold;

const normalizeWebhookUrl = (webhookUrl?: string) => {
	if (typeof webhookUrl !== "string") {
		return undefined;
	}
	const trimmed = webhookUrl.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const disableConnection = async ({
	connection,
	now,
}: {
	connection: BoatCalendarConnection;
	now: Date;
}): Promise<DisabledConnectionLifecycleResult> => {
	const adapter = getCalendarAdapter(connection.provider);
	const hasWatch = hasWatchMetadata(connection);
	let watchStopped = false;
	let stopError: string | undefined;

	if (hasWatch && adapter?.stopWatch) {
		try {
			await stopCalendarConnectionWatch({
				connectionId: connection.id,
			});
			watchStopped = true;
		} catch (error) {
			stopError = toErrorMessage(error);
		}
	} else if (hasWatch && !adapter?.stopWatch) {
		watchStopped = true;
	}

	await db
		.update(boatCalendarConnection)
		.set({
			syncStatus: "disabled",
			lastError: stopError ? `disable_failed:${stopError}` : null,
			watchChannelId: watchStopped ? null : undefined,
			watchResourceId: watchStopped ? null : undefined,
			watchExpiresAt: watchStopped ? null : undefined,
			updatedAt: now,
		})
		.where(eq(boatCalendarConnection.id, connection.id));

	return {
		connectionId: connection.id,
		provider: connection.provider,
		watchStopped,
		error: stopError,
	};
};

const enableConnection = async ({
	connection,
	now,
	activeWatchThreshold,
	webhookUrl,
	webhookChannelToken,
	webhookTtlSeconds,
}: {
	connection: BoatCalendarConnection;
	now: Date;
	activeWatchThreshold: number;
	webhookUrl?: string;
	webhookChannelToken?: string;
	webhookTtlSeconds?: number;
}): Promise<EnabledConnectionLifecycleResult> => {
	await db
		.update(boatCalendarConnection)
		.set({
			syncStatus:
				connection.syncStatus === "disabled" ? "idle" : connection.syncStatus,
			lastError:
				connection.syncStatus === "disabled" ? null : connection.lastError,
			updatedAt: now,
		})
		.where(eq(boatCalendarConnection.id, connection.id));

	let watchStarted = false;
	let syncCompleted = false;
	let lifecycleError: string | undefined;
	const adapter = getCalendarAdapter(connection.provider);

	try {
		if (
			webhookUrl &&
			adapter?.startWatch &&
			!hasActiveWatch(connection, activeWatchThreshold)
		) {
			await startCalendarConnectionWatch({
				connectionId: connection.id,
				webhookUrl,
				channelToken: webhookChannelToken,
				ttlSeconds: webhookTtlSeconds,
			});
			watchStarted = true;
		}

		await syncCalendarConnectionById(connection.id);
		syncCompleted = true;
	} catch (error) {
		lifecycleError = toErrorMessage(error);
		await db
			.update(boatCalendarConnection)
			.set({
				syncStatus: "error",
				lastError: `enable_failed:${lifecycleError}`,
				updatedAt: new Date(),
			})
			.where(eq(boatCalendarConnection.id, connection.id));
	}

	return {
		connectionId: connection.id,
		provider: connection.provider,
		watchStarted,
		syncCompleted,
		error: lifecycleError,
	};
};

const reconcileDisableLifecycle = async ({
	connections,
	now,
}: {
	connections: BoatCalendarConnection[];
	now: Date;
}) => {
	const results: DisabledConnectionLifecycleResult[] = [];
	for (const connection of connections) {
		results.push(
			await disableConnection({
				connection,
				now,
			})
		);
	}
	return {
		changed: true,
		action: "disabled" as const,
		totalConnections: connections.length,
		results,
	};
};

const reconcileEnableLifecycle = async ({
	connections,
	now,
	webhookUrl,
	webhookChannelToken,
	webhookTtlSeconds,
}: {
	connections: BoatCalendarConnection[];
	now: Date;
	webhookUrl?: string;
	webhookChannelToken?: string;
	webhookTtlSeconds?: number;
}) => {
	const activeWatchThreshold = Date.now() + 30_000;
	const results: EnabledConnectionLifecycleResult[] = [];
	for (const connection of connections) {
		results.push(
			await enableConnection({
				connection,
				now,
				activeWatchThreshold,
				webhookUrl,
				webhookChannelToken,
				webhookTtlSeconds,
			})
		);
	}
	return {
		changed: true,
		action: "enabled" as const,
		totalConnections: connections.length,
		results,
	};
};

export const reconcileBoatCalendarConnectionsOnStateChange = async (
	params: ReconcileBoatCalendarConnectionsParams
) => {
	const wasEnabled = canBoatCalendarAutomationRun({
		status: params.previousStatus,
		isActive: params.previousIsActive,
	});
	const shouldEnable = canBoatCalendarAutomationRun({
		status: params.nextStatus,
		isActive: params.nextIsActive,
	});

	if (wasEnabled === shouldEnable) {
		return {
			changed: false,
			action: "none" as const,
		};
	}

	const connections = await db
		.select()
		.from(boatCalendarConnection)
		.where(eq(boatCalendarConnection.boatId, params.boatId));
	const action = shouldEnable ? ("enabled" as const) : ("disabled" as const);
	if (connections.length === 0) {
		return {
			changed: true,
			action,
			totalConnections: 0,
			results: [],
		};
	}

	const now = new Date();
	if (!shouldEnable) {
		return reconcileDisableLifecycle({
			connections,
			now,
		});
	}

	return reconcileEnableLifecycle({
		connections,
		now,
		webhookUrl: normalizeWebhookUrl(params.webhookUrl),
		webhookChannelToken: params.webhookChannelToken,
		webhookTtlSeconds: params.webhookTtlSeconds,
	});
};
