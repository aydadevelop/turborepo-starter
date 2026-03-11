import type { db } from "@my-app/db";
import type { listingCalendarConnection } from "@my-app/db/schema/availability";

// ─── Provider types ──────────────────────────────────────────────────────────

export const calendarAdapterProviderValues = [
	"google",
	"outlook",
	"ical",
	"manual",
] as const;

export type CalendarAdapterProvider =
	(typeof calendarAdapterProviderValues)[number];

// ─── Input / result types ─────────────────────────────────────────────────────

export interface CalendarEventInput {
	title: string;
	description?: string;
	startsAt: Date;
	endsAt: Date;
	timezone: string;
	organizerId?: string;
	attendeeEmails?: string[];
	metadata?: Record<string, string>;
}

/**
 * The result returned after creating or updating a calendar event.
 * Contains enough information to link back to the external service.
 */
export interface CalendarEventPresentation {
	eventId: string;
	calendarId: string;
	syncedAt: Date;
	iCalUid?: string;
	version?: string;
}

/**
 * Per-connection configuration passed into adapter methods.
 * Credentials are stored encrypted in the DB and passed in at call time
 * — adapters must NOT read from process.env directly.
 */
export interface CalendarConnectionConfig {
	provider: CalendarAdapterProvider;
	credentials: Record<string, unknown>;
	calendarId: string;
}

/** A busy time interval returned by listBusySlots. */
export interface BusySlot {
	startsAt: Date;
	endsAt: Date;
	externalEventId?: string;
}

export type Db = typeof db;
export type CalendarConnectionRow =
	typeof listingCalendarConnection.$inferSelect;

// ─── Adapter interface ────────────────────────────────────────────────────────

/**
 * Contract that all calendar provider adapters must implement.
 *
 * createEvent / updateEvent / deleteEvent / listBusySlots accept
 * CalendarConnectionConfig so that per-listing calendar credentials can be
 * passed at call time rather than baked into the adapter instance.
 */
export interface CalendarAdapter {
	createEvent(
		input: CalendarEventInput,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation>;

	updateEvent(
		eventId: string,
		input: Partial<CalendarEventInput>,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation>;

	deleteEvent(
		eventId: string,
		config: CalendarConnectionConfig,
	): Promise<void>;

	listBusySlots(
		calendarId: string,
		from: Date,
		to: Date,
		config: CalendarConnectionConfig,
	): Promise<BusySlot[]>;
}
