import type { relations } from "@my-app/db/relations";
import type {
	listingCalendarConnection,
	organizationCalendarAccount,
	organizationCalendarSource,
} from "@my-app/db/schema/availability";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

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

export interface CalendarAccountConfig {
	provider: CalendarAdapterProvider;
	credentials: Record<string, unknown>;
}

/** A busy time interval returned by listBusySlots. */
export interface BusySlot {
	startsAt: Date;
	endsAt: Date;
	externalEventId?: string;
}

export type Db = PgAsyncDatabase<
	PgQueryResultHKT,
	Record<string, never>,
	typeof relations
>;
export type CalendarConnectionRow =
	typeof listingCalendarConnection.$inferSelect;
export type CalendarAccountRow =
	typeof organizationCalendarAccount.$inferSelect;
export type CalendarSourceRow =
	typeof organizationCalendarSource.$inferSelect;

export interface CalendarSourcePresentation {
	externalCalendarId: string;
	name: string;
	timezone?: string | null;
	isPrimary?: boolean;
	isHidden?: boolean;
	metadata?: Record<string, unknown> | null;
}

export interface CalendarWorkspaceState {
	accountCount: number;
	connectedAccountCount: number;
	accounts: CalendarAccountRow[];
	sourceCount: number;
	activeSourceCount: number;
	sources: CalendarSourceRow[];
	activeConnectionCount: number;
	connections: CalendarConnectionRow[];
	hasConnectedCalendar: boolean;
	providers: CalendarAdapterProvider[];
}

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

	listCalendars(
		config: CalendarAccountConfig,
	): Promise<CalendarSourcePresentation[]>;

	listBusySlots(
		calendarId: string,
		from: Date,
		to: Date,
		config: CalendarConnectionConfig,
	): Promise<BusySlot[]>;
}
