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

export const reconcileBoatCalendarConnectionsOnStateChange = async (params: {
	boatId: string;
	previousStatus: BoatStatus;
	previousIsActive: boolean;
	nextStatus: BoatStatus;
	nextIsActive: boolean;
	webhookUrl?: string;
	webhookChannelToken?: string;
	webhookTtlSeconds?: number;
}) => {
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
	if (connections.length === 0) {
		return {
			changed: true,
			action: shouldEnable ? ("enabled" as const) : ("disabled" as const),
			totalConnections: 0,
			results: [],
		};
	}

	const now = new Date();

	if (!shouldEnable) {
		const results: Array<{
			connectionId: string;
			provider: string;
			watchStopped: boolean;
			error?: string;
		}> = [];

		for (const connection of connections) {
			const adapter = getCalendarAdapter(connection.provider);
			let watchStopped = false;
			let stopError: string | undefined;
			const hasWatch =
				Boolean(connection.watchChannelId) &&
				Boolean(connection.watchResourceId);
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

			results.push({
				connectionId: connection.id,
				provider: connection.provider,
				watchStopped,
				error: stopError,
			});
		}

		return {
			changed: true,
			action: "disabled" as const,
			totalConnections: connections.length,
			results,
		};
	}

	const results: Array<{
		connectionId: string;
		provider: string;
		watchStarted: boolean;
		syncCompleted: boolean;
		error?: string;
	}> = [];
	const activeWatchThreshold = Date.now() + 30_000;
	const webhookUrl =
		typeof params.webhookUrl === "string" && params.webhookUrl.trim().length > 0
			? params.webhookUrl
			: undefined;

	for (const connection of connections) {
		await db
			.update(boatCalendarConnection)
			.set({
				syncStatus:
					connection.syncStatus === "disabled" ? "idle" : connection.syncStatus,
				lastError: connection.syncStatus === "disabled" ? null : connection.lastError,
				updatedAt: now,
			})
			.where(eq(boatCalendarConnection.id, connection.id));

		let watchStarted = false;
		let syncCompleted = false;
		let lifecycleError: string | undefined;
		const adapter = getCalendarAdapter(connection.provider);
		const watchExpiresAt = connection.watchExpiresAt;
		const hasActiveWatch =
			Boolean(connection.watchChannelId) &&
			Boolean(connection.watchResourceId) &&
			watchExpiresAt instanceof Date &&
			watchExpiresAt.getTime() > activeWatchThreshold;

		try {
			if (webhookUrl && adapter?.startWatch && !hasActiveWatch) {
				await startCalendarConnectionWatch({
					connectionId: connection.id,
					webhookUrl,
					channelToken: params.webhookChannelToken,
					ttlSeconds: params.webhookTtlSeconds,
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

		results.push({
			connectionId: connection.id,
			provider: connection.provider,
			watchStarted,
			syncCompleted,
			error: lifecycleError,
		});
	}

	return {
		changed: true,
		action: "enabled" as const,
		totalConnections: connections.length,
		results,
	};
};
