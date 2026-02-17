import { db } from "@full-stack-cf-app/db";
import {
	boatAvailabilityBlock,
	boatCalendarConnection,
	type CalendarProvider,
	calendarWebhookEvent,
} from "@full-stack-cf-app/db/schema/boat";
import { and, desc, eq, ne, sql } from "drizzle-orm";

import { GoogleCalendarApiError } from "../adapters/google-calendar-adapter";
import { getCalendarAdapter } from "../adapters/registry";
import type {
	CalendarEventsResult,
	CalendarWatchChannel,
	CalendarWebhookNotification,
} from "../adapters/types";

const DEFAULT_SYNC_LOOKBACK_DAYS = 120;
const DEFAULT_MAX_RESULTS = 250;

const toSyncErrorMessage = (error: unknown) => {
	if (error instanceof Error) {
		return error.message.slice(0, 1900);
	}
	return "Unknown calendar sync error";
};

const isExpiredSyncTokenError = (error: unknown) =>
	error instanceof GoogleCalendarApiError && error.status === 410;

const normalizeBlockReason = (params: {
	title?: string;
	description?: string;
}) => {
	const title = params.title?.trim();
	if (title) {
		return title;
	}
	const description = params.description?.trim();
	if (description) {
		return description.slice(0, 500);
	}
	return "External calendar event";
};

const resolveEventInterval = (
	event: CalendarEventsResult["events"][number]
) => {
	if (!(event.startsAt && event.endsAt)) {
		return null;
	}
	if (event.startsAt >= event.endsAt) {
		return null;
	}
	return {
		startsAt: event.startsAt,
		endsAt: event.endsAt,
	};
};

const applyExternalEventToAvailabilityBlock = async (params: {
	connection: typeof boatCalendarConnection.$inferSelect;
	event: CalendarEventsResult["events"][number];
	syncedAt: Date;
}) => {
	const interval = resolveEventInterval(params.event);
	if (params.event.status === "cancelled" || !interval) {
		await db
			.update(boatAvailabilityBlock)
			.set({
				isActive: false,
				updatedAt: params.syncedAt,
			})
			.where(
				and(
					eq(boatAvailabilityBlock.calendarConnectionId, params.connection.id),
					eq(boatAvailabilityBlock.externalRef, params.event.externalEventId)
				)
			);
		return;
	}

	await db
		.insert(boatAvailabilityBlock)
		.values({
			id: crypto.randomUUID(),
			boatId: params.connection.boatId,
			calendarConnectionId: params.connection.id,
			source: "calendar",
			externalRef: params.event.externalEventId,
			startsAt: interval.startsAt,
			endsAt: interval.endsAt,
			reason: normalizeBlockReason({
				title: params.event.title,
				description: params.event.description,
			}),
			isActive: true,
			createdAt: params.syncedAt,
			updatedAt: params.syncedAt,
		})
		.onConflictDoUpdate({
			target: [
				boatAvailabilityBlock.calendarConnectionId,
				boatAvailabilityBlock.externalRef,
			],
			set: {
				startsAt: interval.startsAt,
				endsAt: interval.endsAt,
				reason: normalizeBlockReason({
					title: params.event.title,
					description: params.event.description,
				}),
				isActive: true,
				updatedAt: params.syncedAt,
			},
		});
};

const listChangedEvents = async (params: {
	connection: typeof boatCalendarConnection.$inferSelect;
	forceFullSync: boolean;
	initialTimeMin?: Date;
}) => {
	const adapter = getCalendarAdapter(params.connection.provider);
	if (!adapter?.listEvents) {
		throw new Error(
			`Calendar adapter '${params.connection.provider}' does not support incremental event sync`
		);
	}

	const events: CalendarEventsResult["events"] = [];
	let pageToken: string | undefined;
	let nextSyncToken = params.connection.syncToken ?? undefined;
	const syncToken = params.forceFullSync
		? undefined
		: (params.connection.syncToken ?? undefined);
	const queryBase = {
		externalCalendarId: params.connection.externalCalendarId,
		showDeleted: true,
		singleEvents: true,
		maxResults: DEFAULT_MAX_RESULTS,
	};

	do {
		const result = await adapter.listEvents({
			...queryBase,
			syncToken,
			timeMin:
				syncToken === undefined
					? (params.initialTimeMin ??
						new Date(
							Date.now() - DEFAULT_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
						))
					: undefined,
			pageToken,
		});
		events.push(...result.events);
		if (result.nextSyncToken) {
			nextSyncToken = result.nextSyncToken;
		}
		pageToken = result.nextPageToken;
	} while (pageToken);

	return {
		events,
		nextSyncToken,
	};
};

const syncConnectionRecord = async (
	connection: typeof boatCalendarConnection.$inferSelect,
	options?: { initialTimeMin?: Date }
) => {
	const startedAt = new Date();

	await db
		.update(boatCalendarConnection)
		.set({
			syncStatus: "syncing",
			lastError: null,
			updatedAt: startedAt,
		})
		.where(eq(boatCalendarConnection.id, connection.id));

	let recoveredFromExpiredToken = false;
	let listResult: Awaited<ReturnType<typeof listChangedEvents>>;

	try {
		try {
			listResult = await listChangedEvents({
				connection,
				forceFullSync: false,
				initialTimeMin: options?.initialTimeMin,
			});
		} catch (error) {
			if (!(connection.syncToken && isExpiredSyncTokenError(error))) {
				throw error;
			}
			recoveredFromExpiredToken = true;
			listResult = await listChangedEvents({
				connection,
				forceFullSync: true,
				initialTimeMin: options?.initialTimeMin,
			});
		}

		const syncedAt = new Date();
		for (const event of listResult.events) {
			await applyExternalEventToAvailabilityBlock({
				connection,
				event,
				syncedAt,
			});
		}

		await db
			.update(boatCalendarConnection)
			.set({
				syncToken: listResult.nextSyncToken ?? null,
				lastSyncedAt: syncedAt,
				syncStatus: "idle",
				syncRetryCount: 0,
				lastError: null,
				updatedAt: syncedAt,
			})
			.where(eq(boatCalendarConnection.id, connection.id));

		return {
			connectionId: connection.id,
			provider: connection.provider,
			processedEvents: listResult.events.length,
			nextSyncToken: listResult.nextSyncToken ?? null,
			recoveredFromExpiredToken,
		};
	} catch (error) {
		const failedAt = new Date();
		await db
			.update(boatCalendarConnection)
			.set({
				syncStatus: "error",
				syncRetryCount: connection.syncRetryCount + 1,
				lastError: toSyncErrorMessage(error),
				updatedAt: failedAt,
			})
			.where(eq(boatCalendarConnection.id, connection.id));
		throw error;
	}
};

const getCalendarConnectionById = async (connectionId: string) => {
	const [connection] = await db
		.select()
		.from(boatCalendarConnection)
		.where(eq(boatCalendarConnection.id, connectionId))
		.limit(1);

	if (!connection) {
		throw new Error(`Calendar connection not found: ${connectionId}`);
	}
	return connection;
};

const findCalendarConnectionByWebhookNotification = async (params: {
	provider: CalendarProvider;
	notification: CalendarWebhookNotification;
}) => {
	const [connectionWithResourceMatch] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.provider, params.provider),
				eq(
					boatCalendarConnection.watchChannelId,
					params.notification.channelId
				),
				eq(
					boatCalendarConnection.watchResourceId,
					params.notification.resourceId
				)
			)
		)
		.limit(1);

	if (connectionWithResourceMatch) {
		return connectionWithResourceMatch;
	}

	const [connectionWithoutResourceMatch] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.provider, params.provider),
				eq(boatCalendarConnection.watchChannelId, params.notification.channelId)
			)
		)
		.limit(1);

	return connectionWithoutResourceMatch;
};

const registerWebhookEvent = async (params: {
	provider: CalendarProvider;
	notification: CalendarWebhookNotification;
}) => {
	const eventId = crypto.randomUUID();
	const now = new Date();

	await db
		.insert(calendarWebhookEvent)
		.values({
			id: eventId,
			provider: params.provider,
			channelId: params.notification.channelId,
			resourceId: params.notification.resourceId,
			messageNumber: params.notification.messageNumber,
			resourceState: params.notification.resourceState,
			channelToken: params.notification.channelToken,
			resourceUri: params.notification.resourceUri,
			status: "processed",
			receivedAt: now,
			processedAt: null,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: [
				calendarWebhookEvent.provider,
				calendarWebhookEvent.channelId,
				calendarWebhookEvent.messageNumber,
			],
		});

	if (params.notification.messageNumber === undefined) {
		return {
			eventId,
			duplicate: false,
			previousStatus: null as null | string,
			previousConnectionId: null as null | string,
		};
	}

	const [storedEvent] = await db
		.select({
			id: calendarWebhookEvent.id,
			status: calendarWebhookEvent.status,
			calendarConnectionId: calendarWebhookEvent.calendarConnectionId,
		})
		.from(calendarWebhookEvent)
		.where(
			and(
				eq(calendarWebhookEvent.provider, params.provider),
				eq(calendarWebhookEvent.channelId, params.notification.channelId),
				eq(
					calendarWebhookEvent.messageNumber,
					params.notification.messageNumber
				)
			)
		)
		.limit(1);

	if (!storedEvent) {
		return {
			eventId,
			duplicate: false,
			previousStatus: null as null | string,
			previousConnectionId: null as null | string,
		};
	}

	return {
		eventId: storedEvent.id,
		duplicate: storedEvent.id !== eventId,
		previousStatus: storedEvent.status,
		previousConnectionId: storedEvent.calendarConnectionId,
	};
};

const finalizeWebhookEvent = async (params: {
	eventId: string;
	status: "processed" | "skipped" | "failed";
	calendarConnectionId?: string | null;
	errorMessage?: string | null;
}) => {
	await db
		.update(calendarWebhookEvent)
		.set({
			status: params.status,
			calendarConnectionId: params.calendarConnectionId ?? null,
			errorMessage: params.errorMessage ?? null,
			processedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(calendarWebhookEvent.id, params.eventId));
};

export const syncCalendarConnectionById = async (
	connectionId: string,
	options?: { initialTimeMin?: Date }
) => {
	const connection = await getCalendarConnectionById(connectionId);

	if (connection.syncStatus === "disabled") {
		return {
			connectionId,
			provider: connection.provider,
			processedEvents: 0,
			nextSyncToken: connection.syncToken,
			recoveredFromExpiredToken: false,
			skipped: true,
		};
	}

	return syncConnectionRecord(connection, options);
};

export const syncCalendarConnectionByWebhook = async (params: {
	provider: CalendarProvider;
	notification: CalendarWebhookNotification;
}) => {
	const webhookEvent = await registerWebhookEvent(params);
	if (webhookEvent.duplicate) {
		return {
			matched: Boolean(webhookEvent.previousConnectionId),
			duplicate: true,
			webhookEventId: webhookEvent.eventId,
			previousStatus: webhookEvent.previousStatus,
		};
	}

	try {
		const connection =
			await findCalendarConnectionByWebhookNotification(params);
		if (!connection) {
			await finalizeWebhookEvent({
				eventId: webhookEvent.eventId,
				status: "skipped",
				errorMessage: "No matching calendar connection found",
			});

			return {
				matched: false,
				duplicate: false,
				webhookEventId: webhookEvent.eventId,
			};
		}

		if (params.notification.channelExpiration) {
			await db
				.update(boatCalendarConnection)
				.set({
					watchExpiresAt: params.notification.channelExpiration,
					updatedAt: new Date(),
				})
				.where(eq(boatCalendarConnection.id, connection.id));
		}

		const syncResult = await syncConnectionRecord(connection);
		await finalizeWebhookEvent({
			eventId: webhookEvent.eventId,
			status: "processed",
			calendarConnectionId: connection.id,
		});

		return {
			matched: true,
			duplicate: false,
			webhookEventId: webhookEvent.eventId,
			...syncResult,
		};
	} catch (error) {
		await finalizeWebhookEvent({
			eventId: webhookEvent.eventId,
			status: "failed",
			errorMessage: toSyncErrorMessage(error),
		});
		throw error;
	}
};

export const syncCalendarConnectionsByProvider = async (
	provider: CalendarProvider
) => {
	const connections = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.provider, provider),
				ne(boatCalendarConnection.syncStatus, "disabled")
			)
		);

	const results: Array<
		| Awaited<ReturnType<typeof syncConnectionRecord>>
		| { connectionId: string; provider: CalendarProvider; error: string }
	> = [];
	for (const connection of connections) {
		try {
			results.push(await syncConnectionRecord(connection));
		} catch (error) {
			results.push({
				connectionId: connection.id,
				provider,
				error: toSyncErrorMessage(error),
			});
		}
	}

	return {
		provider,
		totalConnections: connections.length,
		results,
	};
};

export const listCalendarWebhookDeadLetters = async (params: {
	provider: CalendarProvider;
	limit?: number;
}) => {
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
	return await db
		.select()
		.from(calendarWebhookEvent)
		.where(
			and(
				eq(calendarWebhookEvent.provider, params.provider),
				eq(calendarWebhookEvent.status, "failed")
			)
		)
		.orderBy(desc(calendarWebhookEvent.receivedAt))
		.limit(limit);
};

export const renewExpiringCalendarWatches = async (params: {
	provider: CalendarProvider;
	webhookUrl: string;
	channelToken?: string;
	ttlSeconds?: number;
	renewBeforeSeconds?: number;
}) => {
	const renewBeforeSeconds = Math.max(params.renewBeforeSeconds ?? 21_600, 60);
	const renewBeforeTime = new Date(Date.now() + renewBeforeSeconds * 1000);

	const adapter = getCalendarAdapter(params.provider);
	if (!(adapter?.startWatch && adapter.stopWatch)) {
		throw new Error(
			`Calendar adapter '${params.provider}' does not support watch renewal`
		);
	}

	const connections = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.provider, params.provider),
				ne(boatCalendarConnection.syncStatus, "disabled"),
				sql`${boatCalendarConnection.watchChannelId} is not null`,
				sql`${boatCalendarConnection.watchResourceId} is not null`,
				sql`${boatCalendarConnection.watchExpiresAt} is not null`,
				sql`${boatCalendarConnection.watchExpiresAt} <= ${renewBeforeTime}`
			)
		)
		.orderBy(boatCalendarConnection.watchExpiresAt);

	const results: Array<
		| {
				connectionId: string;
				provider: CalendarProvider;
				renewed: true;
				watch: CalendarWatchChannel;
		  }
		| {
				connectionId: string;
				provider: CalendarProvider;
				renewed: false;
				error: string;
		  }
	> = [];

	for (const connection of connections) {
		try {
			if (connection.watchChannelId && connection.watchResourceId) {
				await adapter.stopWatch({
					channelId: connection.watchChannelId,
					resourceId: connection.watchResourceId,
				});
			}

			const watch = await adapter.startWatch({
				externalCalendarId: connection.externalCalendarId,
				webhookUrl: params.webhookUrl,
				channelToken: params.channelToken,
				ttlSeconds: params.ttlSeconds,
			});

			await attachCalendarWatchToConnection({
				connectionId: connection.id,
				watch,
			});

			results.push({
				connectionId: connection.id,
				provider: connection.provider,
				renewed: true,
				watch,
			});
		} catch (error) {
			await db
				.update(boatCalendarConnection)
				.set({
					lastError: toSyncErrorMessage(error),
					updatedAt: new Date(),
				})
				.where(eq(boatCalendarConnection.id, connection.id));

			results.push({
				connectionId: connection.id,
				provider: connection.provider,
				renewed: false,
				error: toSyncErrorMessage(error),
			});
		}
	}

	return {
		provider: params.provider,
		renewBeforeSeconds,
		totalCandidates: connections.length,
		renewedCount: results.filter((result) => result.renewed).length,
		results,
	};
};

export const attachCalendarWatchToConnection = async (params: {
	connectionId: string;
	watch: CalendarWatchChannel;
}) => {
	await db
		.update(boatCalendarConnection)
		.set({
			watchChannelId: params.watch.channelId,
			watchResourceId: params.watch.resourceId,
			watchExpiresAt: params.watch.expirationAt,
			syncStatus: "idle",
			lastError: null,
			updatedAt: new Date(),
		})
		.where(eq(boatCalendarConnection.id, params.connectionId));
};

export const startCalendarConnectionWatch = async (params: {
	connectionId: string;
	webhookUrl: string;
	channelToken?: string;
	ttlSeconds?: number;
}) => {
	const connection = await getCalendarConnectionById(params.connectionId);
	const adapter = getCalendarAdapter(connection.provider);
	if (!adapter?.startWatch) {
		throw new Error(
			`Calendar adapter '${connection.provider}' does not support webhook watches`
		);
	}

	const watch = await adapter.startWatch({
		externalCalendarId: connection.externalCalendarId,
		webhookUrl: params.webhookUrl,
		channelToken: params.channelToken,
		ttlSeconds: params.ttlSeconds,
	});

	await attachCalendarWatchToConnection({
		connectionId: connection.id,
		watch,
	});

	return {
		connectionId: connection.id,
		provider: connection.provider,
		watch,
	};
};

export const stopCalendarConnectionWatch = async (params: {
	connectionId: string;
}) => {
	const connection = await getCalendarConnectionById(params.connectionId);
	const adapter = getCalendarAdapter(connection.provider);
	if (!adapter?.stopWatch) {
		throw new Error(
			`Calendar adapter '${connection.provider}' does not support webhook watches`
		);
	}

	if (connection.watchChannelId && connection.watchResourceId) {
		await adapter.stopWatch({
			channelId: connection.watchChannelId,
			resourceId: connection.watchResourceId,
		});
	}

	await db
		.update(boatCalendarConnection)
		.set({
			watchChannelId: null,
			watchResourceId: null,
			watchExpiresAt: null,
			updatedAt: new Date(),
		})
		.where(eq(boatCalendarConnection.id, connection.id));

	return {
		connectionId: connection.id,
		provider: connection.provider,
		stopped: true,
	};
};

const RETRY_BASE_DELAY_MS = 60_000; // 1 minute
const RETRY_MAX_DELAY_MS = 3_600_000; // 1 hour
const RETRY_MAX_ATTEMPTS = 10;

const computeRetryDelay = (retryCount: number) =>
	Math.min(RETRY_BASE_DELAY_MS * 2 ** retryCount, RETRY_MAX_DELAY_MS);

export const retryFailedCalendarSyncs = async (params: {
	provider: CalendarProvider;
}) => {
	const now = Date.now();

	const errorConnections = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.provider, params.provider),
				eq(boatCalendarConnection.syncStatus, "error")
			)
		);

	const eligible = errorConnections.filter((c) => {
		if (c.syncRetryCount >= RETRY_MAX_ATTEMPTS) {
			return false;
		}
		const delay = computeRetryDelay(c.syncRetryCount);
		const updatedAtMs = c.updatedAt?.getTime() ?? 0;
		return now - updatedAtMs >= delay;
	});

	const results: Array<
		| {
				connectionId: string;
				provider: CalendarProvider;
				retried: true;
				processedEvents: number;
		  }
		| {
				connectionId: string;
				provider: CalendarProvider;
				retried: false;
				error: string;
				retryCount: number;
		  }
	> = [];

	for (const connection of eligible) {
		try {
			const result = await syncConnectionRecord(connection);
			results.push({
				connectionId: connection.id,
				provider: connection.provider,
				retried: true,
				processedEvents: result.processedEvents,
			});
		} catch (error) {
			results.push({
				connectionId: connection.id,
				provider: connection.provider,
				retried: false,
				error: toSyncErrorMessage(error),
				retryCount: connection.syncRetryCount + 1,
			});
		}
	}

	return {
		provider: params.provider,
		totalErrorConnections: errorConnections.length,
		eligibleCount: eligible.length,
		retriedCount: results.filter((r) => r.retried).length,
		maxedOutCount: errorConnections.length - eligible.length,
		results,
	};
};
