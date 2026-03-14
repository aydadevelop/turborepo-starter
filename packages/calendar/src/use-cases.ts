import {
	listingCalendarConnection,
	organizationCalendarAccount,
	organizationCalendarSource,
} from "@my-app/db/schema/availability";
import { listing } from "@my-app/db/schema/marketplace";
import type { EventBus } from "@my-app/events";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getCalendarAdapter } from "./adapter-registry";
import type {
	BusySlot,
	CalendarAccountRow,
	CalendarConnectionConfig,
	CalendarConnectionRow,
	CalendarSourceRow,
	Db,
} from "./types";

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

const getAccountCredentials = (
	account: Pick<CalendarAccountRow, "providerMetadata">,
): Record<string, unknown> => {
	const metadata = account.providerMetadata;
	if (!metadata || typeof metadata !== "object") {
		return {};
	}

	const credentials = (metadata as { credentials?: unknown }).credentials;
	if (credentials && typeof credentials === "object") {
		return credentials as Record<string, unknown>;
	}

	return metadata as Record<string, unknown>;
};

const getConnectionConfig = async (
	connection: Pick<
		CalendarConnectionRow,
		"calendarAccountId" | "externalCalendarId" | "provider"
	>,
	db: Db,
): Promise<CalendarConnectionConfig> => {
	if (!connection.externalCalendarId) {
		throw new Error("CALENDAR_CONNECTION_NO_EXTERNAL_ID");
	}

	let credentials: Record<string, unknown> = {};
	if (connection.calendarAccountId) {
		const [account] = await db
			.select()
			.from(organizationCalendarAccount)
			.where(eq(organizationCalendarAccount.id, connection.calendarAccountId))
			.limit(1);
		if (account) {
			credentials = getAccountCredentials(account);
		}
	}

	return {
		provider: connection.provider,
		credentials,
		calendarId: connection.externalCalendarId,
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

export async function connectCalendar(
	input: ConnectCalendarInput,
	db: Db,
	context?: CalendarMutationContext,
): Promise<CalendarConnectionRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
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
				eq(listingCalendarConnection.isActive, true),
			),
		)
		.limit(1);

	if (existing) {
		return existing;
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

	const [row] = await db
		.update(listingCalendarConnection)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(listingCalendarConnection.id, connectionId))
		.returning();
	if (!row) {
		throw new Error("Update failed");
	}

	await emitCalendarReadinessChanged(organizationId, row.id, false, context);

	return row;
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
