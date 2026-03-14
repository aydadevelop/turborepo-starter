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
	attendeeEmails?: string[];
	description?: string;
	endsAt: Date;
	metadata?: Record<string, string>;
	organizerId?: string;
	startsAt: Date;
	timezone: string;
	title: string;
}

/**
 * The result returned after creating or updating a calendar event.
 * Contains enough information to link back to the external service.
 */
export interface CalendarEventPresentation {
	calendarId: string;
	eventId: string;
	iCalUid?: string;
	syncedAt: Date;
	version?: string;
}

/**
 * Per-connection configuration passed into adapter methods.
 * Credentials are stored encrypted in the DB and passed in at call time
 * — adapters must NOT read from process.env directly.
 */
export interface CalendarConnectionConfig {
	calendarId: string;
	credentials: Record<string, unknown>;
	provider: CalendarAdapterProvider;
}

export interface CalendarAccountConfig {
	credentials: Record<string, unknown>;
	provider: CalendarAdapterProvider;
}

/** A busy time interval returned by listBusySlots. */
export interface BusySlot {
	endsAt: Date;
	externalEventId?: string;
	startsAt: Date;
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
export type CalendarSourceRow = typeof organizationCalendarSource.$inferSelect;

export interface CalendarSourcePresentation {
	externalCalendarId: string;
	isHidden?: boolean;
	isPrimary?: boolean;
	metadata?: Record<string, unknown> | null;
	name: string;
	timezone?: string | null;
}

export interface CalendarWorkspaceState {
	accountCount: number;
	accounts: CalendarAccountRow[];
	activeConnectionCount: number;
	activeSourceCount: number;
	connectedAccountCount: number;
	connections: CalendarConnectionRow[];
	hasConnectedCalendar: boolean;
	providers: CalendarAdapterProvider[];
	sourceCount: number;
	sources: CalendarSourceRow[];
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

	deleteEvent(eventId: string, config: CalendarConnectionConfig): Promise<void>;

	listBusySlots(
		calendarId: string,
		from: Date,
		to: Date,
		config: CalendarConnectionConfig,
	): Promise<BusySlot[]>;

	listCalendars(
		config: CalendarAccountConfig,
	): Promise<CalendarSourcePresentation[]>;

	updateEvent(
		eventId: string,
		input: Partial<CalendarEventInput>,
		config: CalendarConnectionConfig,
	): Promise<CalendarEventPresentation>;
}
