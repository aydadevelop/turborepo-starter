import { eq } from "drizzle-orm";
import type { db } from "@my-app/db";
import {
	bookingCalendarLink,
	listingCalendarConnection,
} from "@my-app/db/schema/availability";
import { booking } from "@my-app/db/schema/marketplace";
import { registerEventPusher } from "@my-app/events";
import { getCalendarAdapter } from "./adapter-registry";

type Db = typeof db;

/**
 * Register event handlers that keep external calendars in sync with
 * booking lifecycle transitions.
 *
 * Call once at server startup after registering calendar adapters.
 */
export function registerBookingLifecycleSync(db: Db): void {
	registerEventPusher(async (event) => {
		if (event.type === "booking:confirmed") {
			const data = event.data as { bookingId: string; ownerId: string };
			await syncOnBookingConfirmed(data.bookingId, db);
			return;
		}

		if (event.type === "booking:cancelled") {
			const data = event.data as {
				bookingId: string;
				reason: string;
				refundAmountKopeks: number;
			};
			await syncOnBookingCancelled(data.bookingId, db);
			return;
		}

		if (event.type === "booking:contact-updated") {
			const data = event.data as {
				bookingId: string;
				contactDetails: Record<string, unknown>;
			};
			await syncOnContactUpdated(data.bookingId, data.contactDetails, db);
			return;
		}
	});
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function syncOnBookingConfirmed(
	bookingId: string,
	db: Db,
): Promise<void> {
	const bookingRow = await fetchBooking(bookingId, db);
	if (!bookingRow) return;

	const connection = await fetchActiveConnection(bookingRow.listingId, db);
	if (!connection || !connection.externalCalendarId) return;

	const adapter = getCalendarAdapter(connection.provider);
	const config = {
		provider: connection.provider,
		credentials: {},
		calendarId: connection.externalCalendarId,
	};

	try {
		const presentation = await adapter.createEvent(
			{
				title: `Booking ${bookingId}`,
				startsAt: bookingRow.startsAt,
				endsAt: bookingRow.endsAt,
				timezone: bookingRow.timezone ?? "UTC",
				description: buildEventDescription(bookingRow),
				metadata: { bookingId },
			},
			config,
		);

		await db
			.insert(bookingCalendarLink)
			.values({
				id: crypto.randomUUID(),
				bookingId,
				calendarConnectionId: connection.id,
				provider: connection.provider,
				providerEventId: presentation.eventId,
				icalUid: presentation.iCalUid ?? null,
				lastSyncedAt: presentation.syncedAt,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [bookingCalendarLink.bookingId],
				set: {
					providerEventId: presentation.eventId,
					icalUid: presentation.iCalUid ?? null,
					lastSyncedAt: presentation.syncedAt,
					updatedAt: new Date(),
				},
			});
	} catch (error) {
		// Calendar sync failure is non-fatal — log and continue
		console.error(
			`[calendar-sync] Failed to create event for booking ${bookingId}:`,
			error,
		);
	}
}

async function syncOnBookingCancelled(
	bookingId: string,
	db: Db,
): Promise<void> {
	const linkRows = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);

	const link = linkRows[0];
	if (!link || !link.providerEventId || !link.calendarConnectionId) return;

	const connectionRows = await db
		.select()
		.from(listingCalendarConnection)
		.where(eq(listingCalendarConnection.id, link.calendarConnectionId))
		.limit(1);

	const connection = connectionRows[0];
	if (!connection || !connection.externalCalendarId) return;

	const adapter = getCalendarAdapter(connection.provider);
	const config = {
		provider: connection.provider,
		credentials: {},
		calendarId: connection.externalCalendarId,
	};

	try {
		await adapter.deleteEvent(link.providerEventId, config);
		await db
			.update(bookingCalendarLink)
			.set({ syncError: null, lastSyncedAt: new Date(), updatedAt: new Date() })
			.where(eq(bookingCalendarLink.bookingId, bookingId));
	} catch (error) {
		console.error(
			`[calendar-sync] Failed to delete event for booking ${bookingId}:`,
			error,
		);
	}
}

async function syncOnContactUpdated(
	bookingId: string,
	contactDetails: Record<string, unknown>,
	db: Db,
): Promise<void> {
	const linkRows = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);

	const link = linkRows[0];
	if (!link || !link.providerEventId || !link.calendarConnectionId) return;

	const connectionRows = await db
		.select()
		.from(listingCalendarConnection)
		.where(eq(listingCalendarConnection.id, link.calendarConnectionId))
		.limit(1);

	const connection = connectionRows[0];
	if (!connection || !connection.externalCalendarId) return;

	const adapter = getCalendarAdapter(connection.provider);
	const config = {
		provider: connection.provider,
		credentials: {},
		calendarId: connection.externalCalendarId,
	};

	try {
		await adapter.updateEvent(
			link.providerEventId,
			{
				description: `Contact: ${JSON.stringify(contactDetails)}`,
			},
			config,
		);
		await db
			.update(bookingCalendarLink)
			.set({ lastSyncedAt: new Date(), updatedAt: new Date() })
			.where(eq(bookingCalendarLink.bookingId, bookingId));
	} catch (error) {
		console.error(
			`[calendar-sync] Failed to update event for booking ${bookingId}:`,
			error,
		);
	}
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function fetchBooking(
	bookingId: string,
	db: Db,
) {
	const rows = await db
		.select()
		.from(booking)
		.where(eq(booking.id, bookingId))
		.limit(1);
	return rows[0] ?? null;
}

async function fetchActiveConnection(listingId: string, db: Db) {
	const rows = await db
		.select()
		.from(listingCalendarConnection)
		.where(eq(listingCalendarConnection.listingId, listingId))
		.limit(1);
	return rows[0] ?? null;
}

function buildEventDescription(
	bookingRow: Awaited<ReturnType<typeof fetchBooking>>,
): string {
	if (!bookingRow) return "";
	const parts: string[] = [];
	if (bookingRow.contactName) parts.push(`Guest: ${bookingRow.contactName}`);
	if (bookingRow.contactEmail) parts.push(`Email: ${bookingRow.contactEmail}`);
	if (bookingRow.contactPhone) parts.push(`Phone: ${bookingRow.contactPhone}`);
	if (bookingRow.passengers) parts.push(`Passengers: ${bookingRow.passengers}`);
	return parts.join("\n");
}
