import { and, eq } from "drizzle-orm";
import {
	listingCalendarConnection,
} from "@my-app/db/schema/availability";
import { listing } from "@my-app/db/schema/marketplace";
import { getCalendarAdapter } from "./adapter-registry";
import type { BusySlot, CalendarConnectionRow, Db } from "./types";

export interface ConnectCalendarInput {
	listingId: string;
	organizationId: string;
	provider: "google" | "outlook" | "ical" | "manual";
	calendarId: string;
	createdByUserId?: string;
}

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
): Promise<CalendarConnectionRow> {
	await verifyListingOwnership(input.listingId, input.organizationId, db);
	const [row] = await db.insert(listingCalendarConnection).values({
		id: crypto.randomUUID(),
		listingId: input.listingId,
		organizationId: input.organizationId,
		provider: input.provider,
		externalCalendarId: input.calendarId,
		isActive: true,
		isPrimary: false,
		syncStatus: "idle",
		createdByUserId: input.createdByUserId ?? null,
	}).returning();
	if (!row) {
		throw new Error("Insert failed");
	}
	return row;
}

export async function disconnectCalendar(
	connectionId: string,
	organizationId: string,
	db: Db,
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
	return adapter.listBusySlots(
		connection.externalCalendarId,
		from,
		to,
		{
			provider: connection.provider,
			credentials: {},
			calendarId: connection.externalCalendarId,
		},
	);
}
