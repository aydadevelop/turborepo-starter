import {
	bookingCalendarLink,
	calendarProviderValues,
	calendarWebhookEvent,
	listingAvailabilityBlock,
	listingCalendarConnection,
} from "@my-app/db/schema/availability";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { getCalendarAdapter } from "./adapter-registry";
import { getConnectionConfig } from "./connection-config";
import { GoogleCalendarApiError } from "./google-adapter";
import type {
	CalendarConnectionRow,
	CalendarEventSnapshot,
	CalendarWatchChannel,
	CalendarWebhookNotification,
	Db,
} from "./types";

type CalendarProvider = (typeof calendarProviderValues)[number];

const DEFAULT_MAX_RESULTS = 250;

const RETRY_BASE_DELAY_MS = 60_000;
const RETRY_MAX_DELAY_MS = 3_600_000;
const RETRY_MAX_ATTEMPTS = 10;

const toSyncErrorMessage = (error: unknown) => {
	if (error instanceof Error) {
		return error.message.slice(0, 1_900);
	}
	return "Unknown calendar sync error";
};

const isExpiredSyncTokenError = (error: unknown) =>
	error instanceof GoogleCalendarApiError && error.status === 410;

const computeRetryDelay = (retryCount: number) =>
	Math.min(RETRY_BASE_DELAY_MS * 2 ** retryCount, RETRY_MAX_DELAY_MS);

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

const resolveEventInterval = (event: CalendarEventSnapshot) => {
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

const findCalendarConnectionByWebhookNotification = async (params: {
	db: Db;
	provider: CalendarProvider;
	notification: CalendarWebhookNotification;
}) => {
	const [resourceMatch] = await params.db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.provider, params.provider),
				eq(
					listingCalendarConnection.watchChannelId,
					params.notification.channelId,
				),
				eq(
					listingCalendarConnection.watchResourceId,
					params.notification.resourceId,
				),
			),
		)
		.limit(1);

	if (resourceMatch) {
		return resourceMatch;
	}

	const [channelMatch] = await params.db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.provider, params.provider),
				eq(
					listingCalendarConnection.watchChannelId,
					params.notification.channelId,
				),
			),
		)
		.limit(1);

	return channelMatch ?? null;
};

const getCalendarConnectionById = async (db: Db, connectionId: string) => {
	const [connection] = await db
		.select()
		.from(listingCalendarConnection)
		.where(eq(listingCalendarConnection.id, connectionId))
		.limit(1);

	if (!connection) {
		throw new Error(`Calendar connection not found: ${connectionId}`);
	}

	return connection;
};

const registerWebhookEvent = async (params: {
	connectionId: string;
	db: Db;
	provider: CalendarProvider;
	notification: CalendarWebhookNotification;
}) => {
	if (params.notification.messageNumber !== undefined) {
		const [existing] = await params.db
			.select({
				id: calendarWebhookEvent.id,
				status: calendarWebhookEvent.status,
			})
			.from(calendarWebhookEvent)
			.where(
				and(
					eq(calendarWebhookEvent.calendarConnectionId, params.connectionId),
					eq(calendarWebhookEvent.provider, params.provider),
					eq(
						calendarWebhookEvent.providerChannelId,
						params.notification.channelId,
					),
					eq(
						calendarWebhookEvent.messageNumber,
						params.notification.messageNumber,
					),
				),
			)
			.limit(1);

		if (existing) {
			return {
				eventId: existing.id,
				duplicate: true,
				previousStatus: existing.status,
			};
		}
	}

	const now = new Date();
	const eventId = crypto.randomUUID();

	await params.db.insert(calendarWebhookEvent).values({
		id: eventId,
		calendarConnectionId: params.connectionId,
		provider: params.provider,
		providerChannelId: params.notification.channelId,
		providerResourceId: params.notification.resourceId,
		messageNumber: params.notification.messageNumber ?? null,
		resourceState: params.notification.resourceState,
		status: "processed",
		errorMessage: null,
		payload: {
			channelExpiration: params.notification.channelExpiration?.toISOString(),
			channelId: params.notification.channelId,
			channelToken: params.notification.channelToken ?? null,
			messageNumber: params.notification.messageNumber ?? null,
			resourceId: params.notification.resourceId,
			resourceState: params.notification.resourceState,
			resourceUri: params.notification.resourceUri ?? null,
		},
		receivedAt: now,
		processedAt: null,
		createdAt: now,
		updatedAt: now,
	});

	return {
		eventId,
		duplicate: false,
		previousStatus: null as string | null,
	};
};

const finalizeWebhookEvent = async (params: {
	db: Db;
	errorMessage?: string | null;
	eventId: string;
	status: "processed" | "skipped" | "failed";
}) => {
	await params.db
		.update(calendarWebhookEvent)
		.set({
			status: params.status,
			errorMessage: params.errorMessage ?? null,
			processedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(calendarWebhookEvent.id, params.eventId));
};

const isManagedBookingEvent = async (params: {
	calendarConnectionId: string;
	db: Db;
	event: CalendarEventSnapshot;
}) => {
	const [link] = await params.db
		.select({ id: bookingCalendarLink.id })
		.from(bookingCalendarLink)
		.where(
			and(
				eq(bookingCalendarLink.calendarConnectionId, params.calendarConnectionId),
				params.event.iCalUid
					? or(
							eq(
								bookingCalendarLink.providerEventId,
								params.event.externalEventId,
							),
							eq(bookingCalendarLink.icalUid, params.event.iCalUid),
						)
					: eq(
							bookingCalendarLink.providerEventId,
							params.event.externalEventId,
						),
			),
		)
		.limit(1);

	return Boolean(link);
};

const applyExternalEventToAvailabilityBlock = async (params: {
	connection: CalendarConnectionRow;
	db: Db;
	event: CalendarEventSnapshot;
	syncedAt: Date;
}) => {
	if (
		await isManagedBookingEvent({
			calendarConnectionId: params.connection.id,
			db: params.db,
			event: params.event,
		})
	) {
		return;
	}

	const [existingBlock] = await params.db
		.select()
		.from(listingAvailabilityBlock)
		.where(
			and(
				eq(listingAvailabilityBlock.calendarConnectionId, params.connection.id),
				eq(
					listingAvailabilityBlock.externalRef,
					params.event.externalEventId,
				),
			),
		)
		.limit(1);

	const interval = resolveEventInterval(params.event);
	if (params.event.status === "cancelled" || !interval) {
		if (!existingBlock) {
			return;
		}

		await params.db
			.update(listingAvailabilityBlock)
			.set({
				isActive: false,
				updatedAt: params.syncedAt,
			})
			.where(eq(listingAvailabilityBlock.id, existingBlock.id));

		return;
	}

	if (existingBlock) {
		await params.db
			.update(listingAvailabilityBlock)
			.set({
				startsAt: interval.startsAt,
				endsAt: interval.endsAt,
				reason: normalizeBlockReason({
					title: params.event.title,
					description: params.event.description,
				}),
				isActive: true,
				updatedAt: params.syncedAt,
			})
			.where(eq(listingAvailabilityBlock.id, existingBlock.id));
		return;
	}

	await params.db.insert(listingAvailabilityBlock).values({
		id: crypto.randomUUID(),
		listingId: params.connection.listingId,
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
	});
};

const listChangedEvents = async (params: {
	connection: CalendarConnectionRow;
	db: Db;
	forceFullSync: boolean;
	initialTimeMin?: Date;
}) => {
	if (!params.connection.externalCalendarId) {
		throw new Error("CALENDAR_CONNECTION_NO_EXTERNAL_ID");
	}

	const adapter = getCalendarAdapter(params.connection.provider);
	if (!adapter.listEvents) {
		throw new Error(
			`Calendar adapter '${params.connection.provider}' does not support incremental event sync`,
		);
	}

	const config = await getConnectionConfig(params.connection, params.db);
	const events: CalendarEventSnapshot[] = [];
	let pageToken: string | undefined;
	let nextSyncToken = params.connection.syncToken ?? undefined;
	const syncToken = params.forceFullSync
		? undefined
		: (params.connection.syncToken ?? undefined);

	do {
		const result = await adapter.listEvents(
			{
				calendarId: params.connection.externalCalendarId,
				showDeleted: true,
				singleEvents: true,
				maxResults: DEFAULT_MAX_RESULTS,
				syncToken,
				timeMin:
					syncToken === undefined
						? (params.initialTimeMin ?? new Date())
						: undefined,
				pageToken,
			},
			config,
		);

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
	db: Db,
	connection: CalendarConnectionRow,
	options?: { initialTimeMin?: Date },
) => {
	if (!connection.isActive || connection.syncStatus === "disabled") {
		return {
			connectionId: connection.id,
			provider: connection.provider,
			processedEvents: 0,
			nextSyncToken: connection.syncToken,
			recoveredFromExpiredToken: false,
			skipped: true,
		};
	}

	const startedAt = new Date();
	await db
		.update(listingCalendarConnection)
		.set({
			syncStatus: "syncing",
			lastError: null,
			updatedAt: startedAt,
		})
		.where(eq(listingCalendarConnection.id, connection.id));

	let recoveredFromExpiredToken = false;
	let listResult: Awaited<ReturnType<typeof listChangedEvents>>;

	try {
		try {
			listResult = await listChangedEvents({
				connection,
				db,
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
				db,
				forceFullSync: true,
				initialTimeMin: options?.initialTimeMin,
			});
		}

		const syncedAt = new Date();
		for (const event of listResult.events) {
			await applyExternalEventToAvailabilityBlock({
				connection,
				db,
				event,
				syncedAt,
			});
		}

		await db
			.update(listingCalendarConnection)
			.set({
				syncToken: listResult.nextSyncToken ?? null,
				lastSyncedAt: syncedAt,
				syncStatus: "idle",
				syncRetryCount: 0,
				lastError: null,
				updatedAt: syncedAt,
			})
			.where(eq(listingCalendarConnection.id, connection.id));

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
			.update(listingCalendarConnection)
			.set({
				syncStatus: "error",
				syncRetryCount: connection.syncRetryCount + 1,
				lastError: toSyncErrorMessage(error),
				updatedAt: failedAt,
			})
			.where(eq(listingCalendarConnection.id, connection.id));
		throw error;
	}
};

export const syncCalendarConnectionById = async (
	db: Db,
	connectionId: string,
	options?: { initialTimeMin?: Date },
) => {
	const connection = await getCalendarConnectionById(db, connectionId);
	return syncConnectionRecord(db, connection, options);
};

export const syncCalendarConnectionByWebhook = async (params: {
	db: Db;
	provider: CalendarProvider;
	notification: CalendarWebhookNotification;
}) => {
	const connection = await findCalendarConnectionByWebhookNotification(params);
	if (!connection) {
		return {
			matched: false,
			duplicate: false,
			connectionId: null,
			organizationId: null,
		} as const;
	}

	const webhookEvent = await registerWebhookEvent({
		connectionId: connection.id,
		db: params.db,
		provider: params.provider,
		notification: params.notification,
	});

	if (webhookEvent.duplicate) {
		return {
			matched: true,
			duplicate: true,
			connectionId: connection.id,
			organizationId: connection.organizationId,
			webhookEventId: webhookEvent.eventId,
			previousStatus: webhookEvent.previousStatus,
		} as const;
	}

	try {
		if (params.notification.channelExpiration) {
			await params.db
				.update(listingCalendarConnection)
				.set({
					watchExpiration: params.notification.channelExpiration,
					updatedAt: new Date(),
				})
				.where(eq(listingCalendarConnection.id, connection.id));
		}

		const syncResult = await syncConnectionRecord(params.db, connection);
		await finalizeWebhookEvent({
			db: params.db,
			eventId: webhookEvent.eventId,
			status: "processed",
		});

		return {
			matched: true,
			duplicate: false,
			organizationId: connection.organizationId,
			webhookEventId: webhookEvent.eventId,
			...syncResult,
		} as const;
	} catch (error) {
		await finalizeWebhookEvent({
			db: params.db,
			eventId: webhookEvent.eventId,
			status: "failed",
			errorMessage: toSyncErrorMessage(error),
		});
		throw error;
	}
};

export const syncCalendarConnectionsByProvider = async (
	db: Db,
	provider: CalendarProvider,
) => {
	const connections = await db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.provider, provider),
				eq(listingCalendarConnection.isActive, true),
				ne(listingCalendarConnection.syncStatus, "disabled"),
			),
		);

	const results: Array<
		| Awaited<ReturnType<typeof syncConnectionRecord>>
		| { connectionId: string; provider: CalendarProvider; error: string }
	> = [];

	for (const connection of connections) {
		try {
			results.push(await syncConnectionRecord(db, connection));
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
	db: Db;
	provider: CalendarProvider;
	limit?: number;
}) => {
	const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
	return params.db
		.select()
		.from(calendarWebhookEvent)
		.where(
			and(
				eq(calendarWebhookEvent.provider, params.provider),
				eq(calendarWebhookEvent.status, "failed"),
			),
		)
		.orderBy(desc(calendarWebhookEvent.receivedAt))
		.limit(limit);
};

const attachCalendarWatchToConnection = async (params: {
	connectionId: string;
	db: Db;
	watch: CalendarWatchChannel;
}) => {
	await params.db
		.update(listingCalendarConnection)
		.set({
			watchChannelId: params.watch.channelId,
			watchResourceId: params.watch.resourceId,
			watchExpiration: params.watch.expirationAt ?? null,
			syncStatus: "idle",
			lastError: null,
			updatedAt: new Date(),
		})
		.where(eq(listingCalendarConnection.id, params.connectionId));
};

export const startCalendarConnectionWatch = async (params: {
	connectionId: string;
	db: Db;
	channelToken?: string;
	ttlSeconds?: number;
	webhookUrl: string;
}) => {
	const connection = await getCalendarConnectionById(params.db, params.connectionId);
	if (!connection.isActive || connection.syncStatus === "disabled") {
		throw new Error("CALENDAR_CONNECTION_DISABLED");
	}
	const adapter = getCalendarAdapter(connection.provider);
	if (!adapter.startWatch) {
		throw new Error(
			`Calendar adapter '${connection.provider}' does not support webhook watches`,
		);
	}

	const config = await getConnectionConfig(connection, params.db);
	const watch = await adapter.startWatch(
		{
			webhookUrl: params.webhookUrl,
			channelToken: params.channelToken,
			ttlSeconds: params.ttlSeconds,
		},
		config,
	);

	await attachCalendarWatchToConnection({
		connectionId: connection.id,
		db: params.db,
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
	db: Db;
}) => {
	const connection = await getCalendarConnectionById(params.db, params.connectionId);
	const adapter = getCalendarAdapter(connection.provider);
	if (!adapter.stopWatch) {
		throw new Error(
			`Calendar adapter '${connection.provider}' does not support webhook watches`,
		);
	}

	if (connection.watchChannelId && connection.watchResourceId) {
		const config = await getConnectionConfig(connection, params.db);
		await adapter.stopWatch(
			{
				channelId: connection.watchChannelId,
				resourceId: connection.watchResourceId,
			},
			config,
		);
	}

	await params.db
		.update(listingCalendarConnection)
		.set({
			watchChannelId: null,
			watchResourceId: null,
			watchExpiration: null,
			updatedAt: new Date(),
		})
		.where(eq(listingCalendarConnection.id, connection.id));

	return {
		connectionId: connection.id,
		provider: connection.provider,
		stopped: true,
	};
};

export const renewExpiringCalendarWatches = async (params: {
	db: Db;
	provider: CalendarProvider;
	channelToken?: string;
	renewBeforeSeconds?: number;
	ttlSeconds?: number;
	webhookUrl: string;
}) => {
	const renewBeforeSeconds = Math.max(params.renewBeforeSeconds ?? 21_600, 60);
	const renewBeforeTime = new Date(Date.now() + renewBeforeSeconds * 1000);

	const adapter = getCalendarAdapter(params.provider);
	if (!(adapter.startWatch && adapter.stopWatch)) {
		throw new Error(
			`Calendar adapter '${params.provider}' does not support watch renewal`,
		);
	}

	const connections = await params.db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.provider, params.provider),
				eq(listingCalendarConnection.isActive, true),
				ne(listingCalendarConnection.syncStatus, "disabled"),
				sql`${listingCalendarConnection.watchChannelId} is not null`,
				sql`${listingCalendarConnection.watchResourceId} is not null`,
				sql`${listingCalendarConnection.watchExpiration} is not null`,
				sql`${listingCalendarConnection.watchExpiration} <= ${renewBeforeTime}`,
			),
		)
		.orderBy(listingCalendarConnection.watchExpiration);

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
			const config = await getConnectionConfig(connection, params.db);
			if (connection.watchChannelId && connection.watchResourceId) {
				await adapter.stopWatch(
					{
						channelId: connection.watchChannelId,
						resourceId: connection.watchResourceId,
					},
					config,
				);
			}

			const watch = await adapter.startWatch(
				{
					webhookUrl: params.webhookUrl,
					channelToken: params.channelToken,
					ttlSeconds: params.ttlSeconds,
				},
				config,
			);

			await attachCalendarWatchToConnection({
				connectionId: connection.id,
				db: params.db,
				watch,
			});

			results.push({
				connectionId: connection.id,
				provider: connection.provider,
				renewed: true,
				watch,
			});
		} catch (error) {
			await params.db
				.update(listingCalendarConnection)
				.set({
					lastError: toSyncErrorMessage(error),
					updatedAt: new Date(),
				})
				.where(eq(listingCalendarConnection.id, connection.id));

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

export const retryFailedCalendarSyncs = async (params: {
	db: Db;
	provider: CalendarProvider;
}) => {
	const now = Date.now();
	const errorConnections = await params.db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.provider, params.provider),
				eq(listingCalendarConnection.isActive, true),
				eq(listingCalendarConnection.syncStatus, "error"),
			),
		);

	const eligible = errorConnections.filter((connection) => {
		if (connection.syncRetryCount >= RETRY_MAX_ATTEMPTS) {
			return false;
		}
		const delay = computeRetryDelay(connection.syncRetryCount);
		const updatedAtMs = connection.updatedAt?.getTime() ?? 0;
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
			const result = await syncConnectionRecord(params.db, connection);
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
		retriedCount: results.filter((result) => result.retried).length,
		maxedOutCount: errorConnections.length - eligible.length,
		results,
	};
};