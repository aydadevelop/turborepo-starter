import { eq } from "drizzle-orm";
import type { db } from "@my-app/db";
import {
	listingCalendarConnection,
} from "@my-app/db/schema/availability";
import { getCalendarAdapter } from "./adapter-registry";
import type { BusySlot } from "./types";

export type Db = typeof db;

export interface ConnectCalendarInput {
	listingId: string;
	organizationId: string;
	provider: "google" | "outlook" | "ical" | "manual";
	calendarId: string;
	createdByUserId?: string;
}

export async function connectCalendar(
	input: ConnectCalendarInput,
	db: Db,
): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(listingCalendarConnection).values({
		id,
		listingId: input.listingId,
		organizationId: input.organizationId,
		provider: input.provider,
		externalCalendarId: input.calendarId,
		isActive: true,
		isPrimary: false,
		syncStatus: "idle",
		createdByUserId: input.createdByUserId ?? null,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return id;
}

export async function disconnectCalendar(
	connectionId: string,
	db: Db,
): Promise<void> {
	await db
		.update(listingCalendarConnection)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(listingCalendarConnection.id, connectionId));
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
