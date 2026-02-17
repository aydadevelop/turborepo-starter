import type { CalendarProvider } from "@full-stack-cf-app/db/schema/boat";

import type { NotificationQueueProducer } from "../../context";
import { getCalendarAdapter } from "../adapters/registry";
import {
	listCalendarWebhookDeadLetters,
	renewExpiringCalendarWatches,
	retryFailedCalendarSyncs,
	startCalendarConnectionWatch,
	stopCalendarConnectionWatch,
	syncCalendarConnectionById,
	syncCalendarConnectionByWebhook,
	syncCalendarConnectionsByProvider,
} from "../sync/connection-sync";
import type {
	DeadLetterListOutcome,
	IngestWebhookOutcome,
	InitialSyncOutcome,
	ResyncOutcome,
	RetryFailedSyncsOutcome,
	SyncProviderOutcome,
	WatchRenewOutcome,
	WatchStartOutcome,
	WatchStopOutcome,
} from "./types";

// ─── Use-case: Ingest a calendar webhook ────────────────────────────

export const ingestCalendarWebhook = async (params: {
	provider: CalendarProvider;
	headers: Headers | Record<string, string | undefined>;
	sharedToken?: string;
	notificationQueue?: NotificationQueueProducer;
}): Promise<IngestWebhookOutcome> => {
	const adapter = getCalendarAdapter(params.provider);
	if (!adapter?.parseWebhookNotification) {
		return { kind: "adapter_not_configured" };
	}

	const notification = adapter.parseWebhookNotification(params.headers);
	if (!notification) {
		return { kind: "missing_headers" };
	}

	if (params.sharedToken && notification.channelToken !== params.sharedToken) {
		return { kind: "unauthorized" };
	}

	const result = await syncCalendarConnectionByWebhook({
		provider: params.provider,
		notification,
		notificationQueue: params.notificationQueue,
	});

	if (result.duplicate) {
		return {
			kind: "duplicate",
			webhookEventId: result.webhookEventId,
			matched: result.matched,
			previousStatus: result.previousStatus ?? null,
		};
	}

	return {
		kind: "accepted",
		webhookEventId: result.webhookEventId,
		matched: result.matched,
		connectionId:
			"connectionId" in result ? (result.connectionId ?? undefined) : undefined,
		provider: "provider" in result ? (result.provider ?? undefined) : undefined,
		processedEvents:
			"processedEvents" in result
				? (result.processedEvents ?? undefined)
				: undefined,
		nextSyncToken:
			"nextSyncToken" in result
				? (result.nextSyncToken ?? undefined)
				: undefined,
		recoveredFromExpiredToken:
			"recoveredFromExpiredToken" in result
				? (result.recoveredFromExpiredToken ?? undefined)
				: undefined,
	};
};

// ─── Use-case: Sync all connections for a provider ──────────────────

export const syncGoogleCalendar = async (): Promise<SyncProviderOutcome> => {
	try {
		const result = await syncCalendarConnectionsByProvider("google");
		return {
			kind: "ok",
			...result,
		};
	} catch (error) {
		console.error("Failed to run Google calendar polling sync", error);
		return {
			kind: "error",
			message: "Failed to run calendar polling sync",
		};
	}
};

// ─── Use-case: Start a watch channel ────────────────────────────────

export const startGoogleWatch = async (params: {
	connectionId: string;
	webhookUrl: string;
	channelToken?: string;
	ttlSeconds?: number;
}): Promise<WatchStartOutcome> => {
	try {
		const result = await startCalendarConnectionWatch(params);

		// Catch up on events that may have been missed while the watch was down
		syncCalendarConnectionById(params.connectionId).catch((error) =>
			console.error(
				`Background sync after watch start failed for ${params.connectionId}`,
				error
			)
		);

		return { kind: "ok", ...result };
	} catch (error) {
		console.error("Failed to start Google calendar watch", error);
		return {
			kind: "error",
			message: "Failed to start calendar watch",
		};
	}
};

// ─── Use-case: Stop a watch channel ─────────────────────────────────

export const stopGoogleWatch = async (params: {
	connectionId: string;
}): Promise<WatchStopOutcome> => {
	try {
		const result = await stopCalendarConnectionWatch(params);
		return { kind: "ok", ...result };
	} catch (error) {
		console.error("Failed to stop Google calendar watch", error);
		return {
			kind: "error",
			message: "Failed to stop calendar watch",
		};
	}
};

// ─── Use-case: Renew expiring watches ───────────────────────────────

export const renewGoogleWatches = async (params: {
	webhookUrl: string;
	channelToken?: string;
	ttlSeconds?: number;
	renewBeforeSeconds?: number;
}): Promise<WatchRenewOutcome> => {
	try {
		const result = await renewExpiringCalendarWatches({
			provider: "google",
			...params,
		});
		return { kind: "ok", ...result };
	} catch (error) {
		console.error("Failed to renew Google calendar watches", error);
		return {
			kind: "error",
			message: "Failed to renew calendar watches",
		};
	}
};

// ─── Use-case: List webhook dead letters ────────────────────────────

export const listGoogleDeadLetters = async (params: {
	limit?: number;
}): Promise<DeadLetterListOutcome> => {
	try {
		const deadLetters = await listCalendarWebhookDeadLetters({
			provider: "google",
			limit: params.limit,
		});
		return {
			kind: "ok",
			total: deadLetters.length,
			items: deadLetters,
		};
	} catch (error) {
		console.error("Failed to list calendar webhook dead letters", error);
		return {
			kind: "error",
			message: "Failed to list calendar webhook dead letters",
		};
	}
};

// ─── Use-case: Initial sync after connecting a calendar ─────────────

export const initialSyncCalendarConnection = async (params: {
	connectionId: string;
}): Promise<InitialSyncOutcome> => {
	try {
		const result = await syncCalendarConnectionById(params.connectionId, {
			initialTimeMin: new Date(),
		});

		if ("skipped" in result && result.skipped) {
			return { kind: "skipped", connectionId: params.connectionId };
		}

		return {
			kind: "ok",
			connectionId: result.connectionId,
			provider: result.provider,
			processedEvents: result.processedEvents,
			nextSyncToken: result.nextSyncToken ?? null,
		};
	} catch (error) {
		console.error(
			`Initial sync failed for connection ${params.connectionId}`,
			error
		);
		return {
			kind: "error",
			connectionId: params.connectionId,
			message:
				error instanceof Error ? error.message : "Unknown initial sync error",
		};
	}
};

// ─── Use-case: Manual re-sync a calendar connection ─────────────────

export const resyncCalendarConnection = async (params: {
	connectionId: string;
}): Promise<ResyncOutcome> => {
	try {
		const result = await syncCalendarConnectionById(params.connectionId);

		if ("skipped" in result && result.skipped) {
			return { kind: "skipped", connectionId: params.connectionId };
		}

		return {
			kind: "ok",
			connectionId: result.connectionId,
			provider: result.provider,
			processedEvents: result.processedEvents,
			nextSyncToken: result.nextSyncToken ?? null,
			recoveredFromExpiredToken: result.recoveredFromExpiredToken,
		};
	} catch (error) {
		console.error(
			`Manual resync failed for connection ${params.connectionId}`,
			error
		);
		return {
			kind: "error",
			connectionId: params.connectionId,
			message: error instanceof Error ? error.message : "Unknown sync error",
		};
	}
};

// ─── Use-case: Retry failed calendar syncs with backoff ─────────────

export const retryFailedGoogleSyncs =
	async (): Promise<RetryFailedSyncsOutcome> => {
		try {
			const result = await retryFailedCalendarSyncs({ provider: "google" });
			return { kind: "ok", ...result };
		} catch (error) {
			console.error("Failed to retry failed Google calendar syncs", error);
			return {
				kind: "error",
				message: "Failed to retry failed calendar syncs",
			};
		}
	};
