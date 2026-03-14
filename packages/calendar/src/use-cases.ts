import {
	listingAvailabilityBlock,
	listingCalendarConnection,
	organizationCalendarAccount,
	organizationCalendarSource,
} from "@my-app/db/schema/availability";
import { listing } from "@my-app/db/schema/marketplace";
import type { EventBus } from "@my-app/events";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getCalendarAdapter } from "./adapter-registry";
import {
	listCalendarWebhookDeadLetters,
	renewExpiringCalendarWatches,
	retryFailedCalendarSyncs,
	startCalendarConnectionWatch,
	stopCalendarConnectionWatch,
	syncCalendarConnectionById,
	syncCalendarConnectionByWebhook,
	syncCalendarConnectionsByProvider,
} from "./connection-sync";
import {
	getAccountCredentials,
	getConnectionConfig,
} from "./connection-config";
import {
	createCalendarIngressEvent,
	finalizeCalendarIngressEvent,
	getOrganizationCalendarObservability,
	type CalendarIngressRequestContext,
	type CalendarIngressEventStatus,
} from "./observability";
import type {
	BusySlot,
	CalendarAccountRow,
	CalendarConnectionRow,
	CalendarSourceRow,
	Db,
} from "./types";

const normalizeIngressHeaders = (
	headers: Headers | Record<string, string | undefined>,
): Record<string, string> => {
	if (headers instanceof Headers) {
		return Object.fromEntries(headers.entries());
	}

	return Object.fromEntries(
		Object.entries(headers).filter((entry): entry is [string, string] => {
			return typeof entry[1] === "string";
		}),
	);
};

const finalizeIngressOutcome = async (
	db: Db,
	params: {
		calendarConnectionId?: string | null;
		calendarWebhookEventId?: string | null;
		errorMessage?: string | null;
		ingressEventId?: string;
		notification?: import("./types").CalendarWebhookNotification | null;
		organizationId?: string | null;
		responseCode: number;
		status: CalendarIngressEventStatus;
	},
) => {
	const { ingressEventId, ...rest } = params;
	if (!ingressEventId) {
		return;
	}

	await finalizeCalendarIngressEvent(db, {
		ingressEventId,
		...rest,
	});
};

export interface ConnectCalendarInput {
	calendarId: string;
	createdByUserId?: string;
	listingId: string;
	organizationId: string;
	provider: "google" | "outlook" | "ical" | "manual";
}

export interface ConnectCalendarAccountInput {
	accountEmail?: string | null;
	createdByUserId?: string;
	displayName?: string | null;
	externalAccountId: string;
	organizationId: string;
	provider: "google" | "outlook" | "ical" | "manual";
	providerMetadata?: Record<string, unknown> | null;
}

export interface AttachCalendarSourceInput {
	createdByUserId?: string;
	listingId: string;
	organizationId: string;
	sourceId: string;
}

interface CalendarMutationContext {
	actorUserId?: string;
	eventBus?: EventBus;
}

const mergeProviderMetadata = (
	existing: Record<string, unknown> | null,
	incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
	if (!existing) {
		return incoming ?? null;
	}
	if (!incoming) {
		return existing;
	}

	const existingCredentials =
		typeof existing.credentials === "object" && existing.credentials
			? (existing.credentials as Record<string, unknown>)
			: null;
	const incomingCredentials =
		typeof incoming.credentials === "object" && incoming.credentials
			? (incoming.credentials as Record<string, unknown>)
			: null;

	return {
		...existing,
		...incoming,
		...(existingCredentials || incomingCredentials
			? {
					credentials: {
						...(existingCredentials ?? {}),
						...(incomingCredentials ?? {}),
					},
				}
			: {}),
	};
};
const emitCalendarReadinessChanged = async (
	organizationId: string,
	connectionId: string,
	isReady: boolean,
	context?: CalendarMutationContext,
): Promise<void> => {
	if (!context?.eventBus) {
		return;
	}

	await context.eventBus.emit({
		type: "calendar:organization-connection-readiness-changed",
		organizationId,
		actorUserId: context.actorUserId,
		idempotencyKey: `calendar:readiness:${organizationId}:${connectionId}:${isReady ? "ready" : "not-ready"}`,
		data: {
			connectionId,
			isReady,
		},
	});
};

const verifyListingOwnership = async (
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<void> => {
	const [row] = await db
		.select({ id: listing.id })
		.from(listing)
		.where(
			and(
				eq(listing.id, listingId),
				eq(listing.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}
};

const getOwnedCalendarConnection = async (
	connectionId: string,
	organizationId: string,
	db: Db,
): Promise<CalendarConnectionRow> => {
	const [connection] = await db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.id, connectionId),
				eq(listingCalendarConnection.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!connection) {
		throw new Error("NOT_FOUND");
	}

	return connection;
};

const deactivateImportedCalendarBlocks = async (
	connectionId: string,
	db: Db,
	at: Date,
): Promise<void> => {
	await db
		.update(listingAvailabilityBlock)
		.set({ isActive: false, updatedAt: at })
		.where(
			and(
				eq(listingAvailabilityBlock.calendarConnectionId, connectionId),
				eq(listingAvailabilityBlock.source, "calendar"),
				eq(listingAvailabilityBlock.isActive, true),
			),
		);
};

const stopCalendarWatchBestEffort = async (
	connection: CalendarConnectionRow,
	db: Db,
): Promise<string | null> => {
	if (!(connection.watchChannelId && connection.watchResourceId)) {
		return null;
	}

	const adapter = getCalendarAdapter(connection.provider);
	if (!adapter.stopWatch) {
		return null;
	}

	try {
		const config = await getConnectionConfig(connection, db);
		await adapter.stopWatch(
			{
				channelId: connection.watchChannelId,
				resourceId: connection.watchResourceId,
			},
			config,
		);
		return null;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			`[calendar] Failed to stop watch for connection ${connection.id}:`,
			error,
		);
		return message;
	}
};

export async function connectCalendar(
	input: ConnectCalendarInput,
	db: Db,
	context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);

	const [existing] = await db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.listingId, input.listingId),
				eq(listingCalendarConnection.organizationId, input.organizationId),
				eq(listingCalendarConnection.provider, input.provider),
				eq(listingCalendarConnection.externalCalendarId, input.calendarId),
			),
		)
		.limit(1);

	if (existing) {
		if (existing.isActive && existing.syncStatus !== "disabled") {
			return existing;
		}

		return enableCalendarConnection(
			existing.id,
			input.organizationId,
			db,
			context,
		);
	}

	const [row] = await db
		.insert(listingCalendarConnection)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			organizationId: input.organizationId,
			provider: input.provider,
			externalCalendarId: input.calendarId,
			isActive: true,
			isPrimary: false,
			syncStatus: "idle",
			createdByUserId: input.createdByUserId ?? null,
		})
		.returning();
	if (!row) {
		throw new Error("Insert failed");
	}

	await emitCalendarReadinessChanged(
		input.organizationId,
		row.id,
		true,
		context,
	);

	return row;
}

export async function attachCalendarSourceToListing(
	input: AttachCalendarSourceInput,
	db: Db,
	context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);

	const [source] = await db
		.select()
		.from(organizationCalendarSource)
		.where(
			and(
				eq(organizationCalendarSource.id, input.sourceId),
				eq(organizationCalendarSource.organizationId, input.organizationId),
			),
		)
		.limit(1);

	if (!(source && source.isActive)) {
		throw new Error("NOT_FOUND");
	}

	const [existing] = await db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.listingId, input.listingId),
				eq(listingCalendarConnection.organizationId, input.organizationId),
				eq(listingCalendarConnection.calendarSourceId, source.id),
			),
		)
		.limit(1);

	if (existing) {
		if (existing.isActive && existing.syncStatus !== "disabled") {
			return existing;
		}

		return enableCalendarConnection(
			existing.id,
			input.organizationId,
			db,
			context,
		);
	}

	const [row] = await db
		.insert(listingCalendarConnection)
		.values({
			id: crypto.randomUUID(),
			listingId: input.listingId,
			organizationId: input.organizationId,
			calendarAccountId: source.calendarAccountId,
			calendarSourceId: source.id,
			provider: source.provider,
			externalCalendarId: source.externalCalendarId,
			isActive: true,
			isPrimary: false,
			syncStatus: "idle",
			createdByUserId: input.createdByUserId ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Insert failed");
	}

	await emitCalendarReadinessChanged(
		input.organizationId,
		row.id,
		true,
		context,
	);

	return row;
}

export async function connectOrganizationCalendarAccount(
	input: ConnectCalendarAccountInput,
	db: Db,
): Promise<CalendarAccountRow> {
	const [existing] = await db
		.select()
		.from(organizationCalendarAccount)
		.where(
			and(
				eq(organizationCalendarAccount.organizationId, input.organizationId),
				eq(organizationCalendarAccount.provider, input.provider),
				eq(
					organizationCalendarAccount.externalAccountId,
					input.externalAccountId,
				),
			),
		)
		.limit(1);

	if (existing) {
		const [row] = await db
			.update(organizationCalendarAccount)
			.set({
				accountEmail: input.accountEmail ?? existing.accountEmail,
				displayName: input.displayName ?? existing.displayName,
				status: "connected",
				lastError: null,
				providerMetadata: mergeProviderMetadata(
					existing.providerMetadata as Record<string, unknown> | null,
					input.providerMetadata ?? null,
				),
				updatedAt: new Date(),
			})
			.where(eq(organizationCalendarAccount.id, existing.id))
			.returning();

		if (!row) {
			throw new Error("Update failed");
		}

		return row;
	}

	const [row] = await db
		.insert(organizationCalendarAccount)
		.values({
			id: crypto.randomUUID(),
			organizationId: input.organizationId,
			provider: input.provider,
			externalAccountId: input.externalAccountId,
			accountEmail: input.accountEmail ?? null,
			displayName: input.displayName ?? null,
			status: "connected",
			providerMetadata: input.providerMetadata ?? null,
			createdByUserId: input.createdByUserId ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Insert failed");
	}

	return row;
}

export async function disconnectOrganizationCalendarAccount(
	accountId: string,
	organizationId: string,
	db: Db,
): Promise<CalendarAccountRow> {
	const [account] = await db
		.select()
		.from(organizationCalendarAccount)
		.where(
			and(
				eq(organizationCalendarAccount.id, accountId),
				eq(organizationCalendarAccount.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!account) {
		throw new Error("NOT_FOUND");
	}

	const [row] = await db
		.update(organizationCalendarAccount)
		.set({
			status: "disconnected",
			updatedAt: new Date(),
		})
		.where(eq(organizationCalendarAccount.id, accountId))
		.returning();

	if (!row) {
		throw new Error("Update failed");
	}

	return row;
}

export async function listOrganizationCalendarAccounts(
	organizationId: string,
	db: Db,
): Promise<CalendarAccountRow[]> {
	return db
		.select()
		.from(organizationCalendarAccount)
		.where(eq(organizationCalendarAccount.organizationId, organizationId));
}

export async function listOrganizationCalendarSources(
	organizationId: string,
	db: Db,
	accountId?: string,
): Promise<CalendarSourceRow[]> {
	return db
		.select()
		.from(organizationCalendarSource)
		.where(
			accountId
				? and(
						eq(organizationCalendarSource.organizationId, organizationId),
						eq(organizationCalendarSource.calendarAccountId, accountId),
					)
				: eq(organizationCalendarSource.organizationId, organizationId),
		)
		.orderBy(
			desc(organizationCalendarSource.isPrimary),
			asc(organizationCalendarSource.name),
			asc(organizationCalendarSource.externalCalendarId),
		);
}

export async function setSourceVisibility(
	sourceId: string,
	organizationId: string,
	isHidden: boolean,
	db: Db,
): Promise<CalendarSourceRow> {
	const [updated] = await db
		.update(organizationCalendarSource)
		.set({ isHidden, updatedAt: new Date() })
		.where(
			and(
				eq(organizationCalendarSource.id, sourceId),
				eq(organizationCalendarSource.organizationId, organizationId),
			),
		)
		.returning();
	if (!updated) {
		throw new Error("NOT_FOUND");
	}
	return updated;
}

export async function refreshOrganizationCalendarSources(
	accountId: string,
	organizationId: string,
	db: Db,
): Promise<CalendarSourceRow[]> {
	const [account] = await db
		.select()
		.from(organizationCalendarAccount)
		.where(
			and(
				eq(organizationCalendarAccount.id, accountId),
				eq(organizationCalendarAccount.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!account) {
		throw new Error("NOT_FOUND");
	}

	const adapter = getCalendarAdapter(account.provider);
	const now = new Date();

	try {
		const discovered = await adapter.listCalendars({
			provider: account.provider,
			credentials: getAccountCredentials(account),
		});

		await db
			.update(organizationCalendarSource)
			.set({
				isActive: false,
				updatedAt: now,
			})
			.where(eq(organizationCalendarSource.calendarAccountId, account.id));

		for (const source of discovered) {
			await db
				.insert(organizationCalendarSource)
				.values({
					id: crypto.randomUUID(),
					organizationId,
					calendarAccountId: account.id,
					provider: account.provider,
					externalCalendarId: source.externalCalendarId,
					name: source.name,
					timezone: source.timezone ?? null,
					isPrimary: source.isPrimary ?? false,
					isHidden: source.isHidden ?? false,
					isActive: true,
					sourceMetadata: source.metadata ?? null,
					lastDiscoveredAt: now,
				})
				.onConflictDoUpdate({
					target: [
						organizationCalendarSource.calendarAccountId,
						organizationCalendarSource.externalCalendarId,
					],
					set: {
						name: source.name,
						timezone: source.timezone ?? null,
						isPrimary: source.isPrimary ?? false,
						isHidden: source.isHidden ?? false,
						isActive: true,
						sourceMetadata: source.metadata ?? null,
						lastDiscoveredAt: now,
						updatedAt: now,
					},
				});
		}

		await db
			.update(organizationCalendarAccount)
			.set({
				status: "connected",
				lastSyncedAt: now,
				lastError: null,
				updatedAt: now,
			})
			.where(eq(organizationCalendarAccount.id, account.id));

		return listOrganizationCalendarSources(organizationId, db, account.id);
	} catch (error) {
		await db
			.update(organizationCalendarAccount)
			.set({
				status: "error",
				lastError: error instanceof Error ? error.message : "Unknown error",
				updatedAt: now,
			})
			.where(eq(organizationCalendarAccount.id, account.id));
		throw error;
	}
}

export async function disconnectCalendar(
	connectionId: string,
	organizationId: string,
	db: Db,
	context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	return disableCalendarConnection(connectionId, organizationId, db, context);
}

export async function disableCalendarConnection(
	connectionId: string,
	organizationId: string,
	db: Db,
	context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	const connection = await getOwnedCalendarConnection(
		connectionId,
		organizationId,
		db,
	);
	const now = new Date();
	const watchError = await stopCalendarWatchBestEffort(connection, db);

	await deactivateImportedCalendarBlocks(connection.id, db, now);

	const [row] = await db
		.update(listingCalendarConnection)
		.set({
			isActive: false,
			syncStatus: "disabled",
			syncToken: null,
			syncRetryCount: 0,
			watchChannelId: null,
			watchResourceId: null,
			watchExpiration: null,
			lastError: watchError,
			updatedAt: now,
		})
		.where(eq(listingCalendarConnection.id, connection.id))
		.returning();

	if (!row) {
		throw new Error("Update failed");
	}

	await emitCalendarReadinessChanged(organizationId, row.id, false, context);

	return row;
}

export async function enableCalendarConnection(
	connectionId: string,
	organizationId: string,
	db: Db,
	context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	const connection = await getOwnedCalendarConnection(
		connectionId,
		organizationId,
		db,
	);
	const now = new Date();

	const [row] = await db
		.update(listingCalendarConnection)
		.set({
			isActive: true,
			syncStatus: "idle",
			syncToken: null,
			syncRetryCount: 0,
			lastError: null,
			updatedAt: now,
		})
		.where(eq(listingCalendarConnection.id, connection.id))
		.returning();

	if (!row) {
		throw new Error("Update failed");
	}

	await emitCalendarReadinessChanged(organizationId, row.id, true, context);

	const adapter = getCalendarAdapter(row.provider);
	if (row.externalCalendarId && adapter.listEvents) {
		try {
			await syncCalendarConnectionById(db, row.id, { initialTimeMin: now });
		} catch {
			// The connection remains enabled; sync status + lastError already capture the failure.
		}
	}

	return getOwnedCalendarConnection(connectionId, organizationId, db);
}

export async function listCalendarConnections(
	listingId: string,
	organizationId: string,
	db: Db,
): Promise<CalendarConnectionRow[]> {
	await verifyListingOwnership(listingId, organizationId, db);
	return db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.listingId, listingId),
				eq(listingCalendarConnection.organizationId, organizationId),
			),
		);
}

export async function listCalendarBusySlots(
	connectionId: string,
	from: Date,
	to: Date,
	db: Db,
): Promise<BusySlot[]> {
	const rows = await db
		.select()
		.from(listingCalendarConnection)
		.where(eq(listingCalendarConnection.id, connectionId))
		.limit(1);

	const connection = rows[0];
	if (!connection) {
		throw new Error(`CALENDAR_CONNECTION_NOT_FOUND: ${connectionId}`);
	}
	if (!connection.isActive) {
		throw new Error(`CALENDAR_CONNECTION_INACTIVE: ${connectionId}`);
	}
	if (!connection.externalCalendarId) {
		throw new Error(`CALENDAR_CONNECTION_NO_EXTERNAL_ID: ${connectionId}`);
	}

	const adapter = getCalendarAdapter(connection.provider);
	const config = await getConnectionConfig(connection, db);
	return adapter.listBusySlots(connection.externalCalendarId, from, to, config);
}

export async function setConnectionPrimary(
	connectionId: string,
	organizationId: string,
	db: Db,
	_context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	const [connection] = await db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.id, connectionId),
				eq(listingCalendarConnection.organizationId, organizationId),
				eq(listingCalendarConnection.isActive, true),
			),
		)
		.limit(1);

	if (!connection) {
		throw new Error("NOT_FOUND");
	}

	// Clear any existing primary for this listing
	await db
		.update(listingCalendarConnection)
		.set({ isPrimary: false, updatedAt: new Date() })
		.where(
			and(
				eq(listingCalendarConnection.listingId, connection.listingId),
				eq(listingCalendarConnection.organizationId, organizationId),
				eq(listingCalendarConnection.isPrimary, true),
				ne(listingCalendarConnection.id, connectionId),
			),
		);

	const [row] = await db
		.update(listingCalendarConnection)
		.set({ isPrimary: true, updatedAt: new Date() })
		.where(eq(listingCalendarConnection.id, connectionId))
		.returning();

	if (!row) {
		throw new Error("Update failed");
	}

	return row;
}

export async function listAllOrgConnections(
	organizationId: string,
	db: Db,
): Promise<CalendarConnectionRow[]> {
	return db
		.select()
		.from(listingCalendarConnection)
		.where(eq(listingCalendarConnection.organizationId, organizationId));
}

export const ingestCalendarWebhook = async (
	params: {
		headers: Headers | Record<string, string | undefined>;
		provider: "google" | "outlook" | "ical" | "manual";
		request?: CalendarIngressRequestContext;
		sharedToken?: string;
	},
	db: Db,
): Promise<
	| { kind: "accepted"; matched: boolean; webhookEventId?: string }
	| { kind: "adapter_not_configured" }
	| { kind: "duplicate"; matched: boolean; previousStatus: string | null; webhookEventId: string }
	| { kind: "missing_headers" }
	| { kind: "unauthorized" }
> => {
	const ingressEvent = params.request
		? await createCalendarIngressEvent(db, {
				provider: params.provider,
				request: {
					...params.request,
					headers:
						params.request.headers ?? normalizeIngressHeaders(params.headers),
				},
			})
		: null;

	const adapter = getCalendarAdapter(params.provider);
	if (!adapter.parseWebhookNotification) {
		await finalizeIngressOutcome(db, {
			ingressEventId: ingressEvent?.id,
			responseCode: 202,
			status: "adapter_not_configured",
		});
		return { kind: "adapter_not_configured" };
	}

	const notification = adapter.parseWebhookNotification(params.headers);
	if (!notification) {
		await finalizeIngressOutcome(db, {
			ingressEventId: ingressEvent?.id,
			responseCode: 202,
			status: "missing_headers",
		});
		return { kind: "missing_headers" };
	}

	if (params.sharedToken && notification.channelToken !== params.sharedToken) {
		await finalizeIngressOutcome(db, {
			ingressEventId: ingressEvent?.id,
			notification,
			responseCode: 401,
			status: "unauthorized",
		});
		return { kind: "unauthorized" };
	}

	let result:
		| Awaited<ReturnType<typeof syncCalendarConnectionByWebhook>>
		| undefined;

	try {
		result = await syncCalendarConnectionByWebhook({
			db,
			provider: params.provider,
			notification,
		});
	} catch (error) {
		await finalizeIngressOutcome(db, {
			calendarConnectionId: null,
			errorMessage: error instanceof Error ? error.message : "Unknown error",
			ingressEventId: ingressEvent?.id,
			notification,
			organizationId: null,
			responseCode: 500,
			status: "failed",
		});
		throw error;
	}

	if (result.duplicate) {
		await finalizeIngressOutcome(db, {
			calendarConnectionId: result.connectionId ?? null,
			calendarWebhookEventId: result.webhookEventId,
			ingressEventId: ingressEvent?.id,
			notification,
			organizationId: result.organizationId ?? null,
			responseCode: 200,
			status: "duplicate",
		});
		return {
			kind: "duplicate",
			matched: result.matched,
			previousStatus: result.previousStatus,
			webhookEventId: result.webhookEventId,
		};
	}

	await finalizeIngressOutcome(db, {
		calendarConnectionId: result.matched ? (result.connectionId ?? null) : null,
		calendarWebhookEventId:
			"webhookEventId" in result ? (result.webhookEventId ?? null) : null,
		ingressEventId: ingressEvent?.id,
		notification,
		organizationId: result.matched ? (result.organizationId ?? null) : null,
		responseCode: 202,
		status: result.matched ? "accepted" : "unmatched",
	});

	return {
		kind: "accepted",
		matched: result.matched,
		webhookEventId: "webhookEventId" in result ? result.webhookEventId : undefined,
	};
};

export const getOrgCalendarObservability = async (
	params: {
		limit?: number;
		organizationId: string;
	},
	db: Db,
) => {
	return getOrganizationCalendarObservability(params, db);
};

export const syncGoogleCalendar = async (db: Db) => {
	try {
		const result = await syncCalendarConnectionsByProvider(db, "google");
		return {
			kind: "ok" as const,
			...result,
		};
	} catch (error) {
		console.error("Failed to run Google calendar polling sync", error);
		return {
			kind: "error" as const,
			message: "Failed to run calendar polling sync",
		};
	}
};

export const startGoogleWatch = async (
	params: {
		channelToken?: string;
		connectionId: string;
		ttlSeconds?: number;
		webhookUrl: string;
	},
	db: Db,
) => {
	try {
		const result = await startCalendarConnectionWatch({
			connectionId: params.connectionId,
			channelToken: params.channelToken,
			ttlSeconds: params.ttlSeconds,
			webhookUrl: params.webhookUrl,
			db,
		});

		syncCalendarConnectionById(db, params.connectionId, {
			initialTimeMin: new Date(),
		}).catch((error) => {
			console.error(
				`Background sync after watch start failed for ${params.connectionId}`,
				error,
			);
		});

		return { kind: "ok" as const, ...result };
	} catch (error) {
		console.error("Failed to start Google calendar watch", error);
		return {
			kind: "error" as const,
			message: "Failed to start calendar watch",
		};
	}
};

export const stopGoogleWatch = async (
	params: { connectionId: string },
	db: Db,
) => {
	try {
		const result = await stopCalendarConnectionWatch({
			connectionId: params.connectionId,
			db,
		});
		return { kind: "ok" as const, ...result };
	} catch (error) {
		console.error("Failed to stop Google calendar watch", error);
		return {
			kind: "error" as const,
			message: "Failed to stop calendar watch",
		};
	}
};

export const renewGoogleWatches = async (
	params: {
		channelToken?: string;
		renewBeforeSeconds?: number;
		ttlSeconds?: number;
		webhookUrl: string;
	},
	db: Db,
) => {
	try {
		const result = await renewExpiringCalendarWatches({
			provider: "google",
			channelToken: params.channelToken,
			renewBeforeSeconds: params.renewBeforeSeconds,
			ttlSeconds: params.ttlSeconds,
			webhookUrl: params.webhookUrl,
			db,
		});
		return { kind: "ok" as const, ...result };
	} catch (error) {
		console.error("Failed to renew Google calendar watches", error);
		return {
			kind: "error" as const,
			message: "Failed to renew calendar watches",
		};
	}
};

export const listGoogleDeadLetters = async (
	params: { limit?: number },
	db: Db,
) => {
	try {
		const items = await listCalendarWebhookDeadLetters({
			provider: "google",
			limit: params.limit,
			db,
		});
		return {
			kind: "ok" as const,
			total: items.length,
			items,
		};
	} catch (error) {
		console.error("Failed to list calendar webhook dead letters", error);
		return {
			kind: "error" as const,
			message: "Failed to list calendar webhook dead letters",
		};
	}
};

export const retryFailedGoogleSyncs = async (db: Db) => {
	try {
		const result = await retryFailedCalendarSyncs({
			provider: "google",
			db,
		});
		return { kind: "ok" as const, ...result };
	} catch (error) {
		console.error("Failed to retry failed Google calendar syncs", error);
		return {
			kind: "error" as const,
			message: "Failed to retry failed calendar syncs",
		};
	}
};
