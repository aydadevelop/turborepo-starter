import {
	bookingCalendarLink,
	listingCalendarConnection,
	organizationCalendarAccount,
} from "@my-app/db/schema/availability";
import { booking } from "@my-app/db/schema/marketplace";
import { registerEventPusher } from "@my-app/events";
import { and, eq, ne } from "drizzle-orm";
import { getCalendarAdapter } from "./adapter-registry";
import type { Db } from "./types";

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

		if (event.type === "booking:schedule-updated") {
			await syncOnBookingScheduleUpdated(
				(event.data as { bookingId: string }).bookingId,
				db,
			);
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
	if (!bookingRow) {
		return;
	}

	const connection = await fetchActiveConnection(bookingRow.listingId, db);
	if (!(connection && connection.externalCalendarId)) {
		return;
	}

	const adapter = getCalendarAdapter(connection.provider);
	const config = await buildConnectionConfig(connection, db);

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
	if (!(link && link.providerEventId && link.calendarConnectionId)) {
		return;
	}

	const connection = await fetchUsableConnectionById(link.calendarConnectionId, db);
	if (!(connection && connection.externalCalendarId)) {
		return;
	}

	const adapter = getCalendarAdapter(connection.provider);
	const config = await buildConnectionConfig(connection, db);

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
	if (!(link && link.providerEventId && link.calendarConnectionId)) {
		return;
	}

	const connection = await fetchUsableConnectionById(link.calendarConnectionId, db);
	if (!(connection && connection.externalCalendarId)) {
		return;
	}

	const adapter = getCalendarAdapter(connection.provider);
	const config = await buildConnectionConfig(connection, db);

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

async function syncOnBookingScheduleUpdated(
	bookingId: string,
	db: Db,
): Promise<void> {
	const linkRows = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);

	const link = linkRows[0];
	if (!(link && link.providerEventId && link.calendarConnectionId)) {
		return;
	}

	const connection = await fetchUsableConnectionById(link.calendarConnectionId, db);
	if (!(connection && connection.externalCalendarId)) {
		return;
	}

	const bookingRow = await fetchBooking(bookingId, db);
	if (!bookingRow) {
		return;
	}

	const adapter = getCalendarAdapter(connection.provider);
	const config = await buildConnectionConfig(connection, db);

	try {
		const presentation = await adapter.updateEvent(
			link.providerEventId,
			{
				startsAt: bookingRow.startsAt,
				endsAt: bookingRow.endsAt,
				timezone: bookingRow.timezone ?? "UTC",
				description: buildEventDescription(bookingRow),
			},
			config,
		);
		await db
			.update(bookingCalendarLink)
			.set({
				syncError: null,
				lastSyncedAt: presentation.syncedAt,
				updatedAt: new Date(),
			})
			.where(eq(bookingCalendarLink.bookingId, bookingId));
	} catch (error) {
		console.error(
			`[calendar-sync] Failed to update event schedule for booking ${bookingId}:`,
			error,
		);
	}
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function fetchBooking(bookingId: string, db: Db) {
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
		.where(
			and(
				eq(listingCalendarConnection.listingId, listingId),
				eq(listingCalendarConnection.isActive, true),
				ne(listingCalendarConnection.syncStatus, "disabled"),
			),
		);

	const [preferred] = rows.sort((left, right) => {
		if (left.isPrimary === right.isPrimary) {
			return right.updatedAt.getTime() - left.updatedAt.getTime();
		}

		return left.isPrimary ? -1 : 1;
	});

	return preferred ?? null;
}

async function fetchUsableConnectionById(connectionId: string, db: Db) {
	const rows = await db
		.select()
		.from(listingCalendarConnection)
		.where(
			and(
				eq(listingCalendarConnection.id, connectionId),
				eq(listingCalendarConnection.isActive, true),
				ne(listingCalendarConnection.syncStatus, "disabled"),
			),
		)
		.limit(1);

	return rows[0] ?? null;
}

async function buildConnectionConfig(
	connection: Pick<
		typeof listingCalendarConnection.$inferSelect,
		"calendarAccountId" | "externalCalendarId" | "provider"
	>,
	db: Db,
) {
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

		const metadata = account?.providerMetadata;
		if (metadata && typeof metadata === "object") {
			const nestedCredentials = (metadata as { credentials?: unknown })
				.credentials;
			if (nestedCredentials && typeof nestedCredentials === "object") {
				credentials = nestedCredentials as Record<string, unknown>;
			} else {
				credentials = metadata as Record<string, unknown>;
			}
		}
	}

	return {
		provider: connection.provider,
		credentials,
		calendarId: connection.externalCalendarId,
	};
}

function buildEventDescription(
	bookingRow: Awaited<ReturnType<typeof fetchBooking>>,
): string {
	if (!bookingRow) {
		return "";
	}
	const parts: string[] = [];
	if (bookingRow.contactName) {
		parts.push(`Guest: ${bookingRow.contactName}`);
	}
	if (bookingRow.contactEmail) {
		parts.push(`Email: ${bookingRow.contactEmail}`);
	}
	if (bookingRow.contactPhone) {
		parts.push(`Phone: ${bookingRow.contactPhone}`);
	}
	if (bookingRow.passengers) {
		parts.push(`Passengers: ${bookingRow.passengers}`);
	}
	return parts.join("\n");
}
