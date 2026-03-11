import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";
import { booking, listing } from "./marketplace";

/**
 * Availability, calendar sync, and scheduling tables.
 *
 * Ported from legacy boat-specific availability to generic listing-level availability.
 * Supports recurring weekly rules, one-off blocks, external calendar sync (Google/Outlook/iCal),
 * and minimum-duration constraints per time window.
 */

export const calendarProviderValues = [
	"google",
	"outlook",
	"ical",
	"manual",
] as const;

export const calendarConnectionSyncStatusValues = [
	"idle",
	"syncing",
	"error",
	"disabled",
] as const;

export const availabilityBlockSourceValues = [
	"manual",
	"calendar",
	"maintenance",
	"system",
] as const;

export const calendarWebhookEventStatusValues = [
	"processed",
	"skipped",
	"failed",
] as const;

export const calendarProviderEnum = pgEnum(
	"calendar_provider",
	calendarProviderValues
);
export const calendarConnectionSyncStatusEnum = pgEnum(
	"calendar_connection_sync_status",
	calendarConnectionSyncStatusValues
);
export const availabilityBlockSourceEnum = pgEnum(
	"availability_block_source",
	availabilityBlockSourceValues
);
export const calendarWebhookEventStatusEnum = pgEnum(
	"calendar_webhook_event_status",
	calendarWebhookEventStatusValues
);

/** Recurring weekly availability windows per listing (e.g. Mon 9:00–18:00). */
export const listingAvailabilityRule = pgTable(
	"listing_availability_rule",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday … 6 = Saturday
		startMinute: integer("start_minute").notNull(), // 0–1440
		endMinute: integer("end_minute").notNull(), // 0–1440, must be > startMinute
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_availability_rule_ix_listing_id").on(table.listingId),
		uniqueIndex("listing_availability_rule_uq_listing_day_start").on(
			table.listingId,
			table.dayOfWeek,
			table.startMinute
		),
		check(
			"listing_availability_rule_ck_day_of_week",
			sql`${table.dayOfWeek} between 0 and 6`,
		),
		check(
			"listing_availability_rule_ck_minute_range",
			sql`${table.startMinute} >= 0 and ${table.startMinute} < 1440 and ${table.endMinute} > ${table.startMinute} and ${table.endMinute} <= 1440`,
		),
	]
);

/** One-off date overrides: blocked dates, holiday closures, extended hours. */
export const listingAvailabilityException = pgTable(
	"listing_availability_exception",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		date: date("date", { mode: "string" }).notNull(),
		isAvailable: boolean("is_available").notNull().default(false),
		startMinute: integer("start_minute"), // null → whole day
		endMinute: integer("end_minute"),
		reason: text("reason"),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("listing_availability_exception_ix_listing_id").on(table.listingId),
		index("listing_availability_exception_ix_date").on(table.date),
		uniqueIndex("listing_availability_exception_uq_listing_date").on(
			table.listingId,
			table.date
		),
		check(
			"listing_availability_exception_ck_minutes",
			sql`(
				(${table.startMinute} is null and ${table.endMinute} is null)
				or (
					${table.startMinute} is not null
					and ${table.endMinute} is not null
					and ${table.startMinute} >= 0
					and ${table.startMinute} < 1440
					and ${table.endMinute} > ${table.startMinute}
					and ${table.endMinute} <= 1440
				)
			)`,
		),
	]
);

/** Blocked time slots on a listing (manual blocks, calendar imports, maintenance windows). */
export const listingAvailabilityBlock = pgTable(
	"listing_availability_block",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		calendarConnectionId: text("calendar_connection_id").references(
			() => listingCalendarConnection.id,
			{ onDelete: "set null" }
		),
		source: availabilityBlockSourceEnum("source").notNull().default("manual"),
		externalRef: text("external_ref"),
		startsAt: timestamp("starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		endsAt: timestamp("ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		reason: text("reason"),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("listing_availability_block_ix_listing_id").on(table.listingId),
		index("listing_availability_block_ix_calendar_connection_id").on(
			table.calendarConnectionId,
		),
		index("listing_availability_block_ix_starts_at").on(table.startsAt),
		index("listing_availability_block_ix_source").on(table.source),
		check(
			"listing_availability_block_ck_window",
			sql`${table.endsAt} > ${table.startsAt}`,
		),
	]
);

/** Minimum duration constraints per time window (e.g. weekends require 3h minimum). */
export const listingMinimumDurationRule = pgTable(
	"listing_minimum_duration_rule",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		startHour: integer("start_hour").notNull(), // 0–23
		startMinute: integer("start_minute").notNull().default(0), // 0–59
		endHour: integer("end_hour").notNull(),
		endMinute: integer("end_minute").notNull().default(0),
		minimumDurationMinutes: integer("minimum_duration_minutes").notNull(),
		daysOfWeek: jsonb("days_of_week").$type<number[]>(), // null = all days
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_minimum_duration_rule_ix_listing_id").on(table.listingId),
		check(
			"listing_minimum_duration_rule_ck_time_bounds",
			sql`${table.startHour} between 0 and 23 and ${table.endHour} between 0 and 23 and ${table.startMinute} between 0 and 59 and ${table.endMinute} between 0 and 59`,
		),
		check(
			"listing_minimum_duration_rule_ck_positive_duration",
			sql`${table.minimumDurationMinutes} > 0 and ((${table.endHour} * 60) + ${table.endMinute}) > ((${table.startHour} * 60) + ${table.startMinute})`,
		),
	]
);

/** External calendar connections for bi-directional sync (Google, Outlook, iCal). */
export const listingCalendarConnection = pgTable(
	"listing_calendar_connection",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		provider: calendarProviderEnum("provider").notNull(),
		externalCalendarId: text("external_calendar_id"),
		syncToken: text("sync_token"),
		watchChannelId: text("watch_channel_id"),
		watchResourceId: text("watch_resource_id"),
		watchExpiration: timestamp("watch_expiration", {
			withTimezone: true,
			mode: "date",
		}),
		syncStatus: calendarConnectionSyncStatusEnum("sync_status")
			.notNull()
			.default("idle"),
		syncRetryCount: integer("sync_retry_count").notNull().default(0),
		lastSyncedAt: timestamp("last_synced_at", {
			withTimezone: true,
			mode: "date",
		}),
		lastError: text("last_error"),
		isPrimary: boolean("is_primary").notNull().default(false),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("listing_calendar_connection_ix_listing_id").on(table.listingId),
		index("listing_calendar_connection_ix_organization_id").on(
			table.organizationId
		),
		index("listing_calendar_connection_ix_sync_status").on(table.syncStatus),
		uniqueIndex("listing_calendar_connection_uq_primary_listing")
			.on(table.listingId)
			.where(
				sql`${table.isPrimary} = true and ${table.isActive} = true`,
			),
	]
);

/** Webhook events from external calendar providers (Google push, Outlook subscriptions). */
export const calendarWebhookEvent = pgTable(
	"calendar_webhook_event",
	{
		id: text("id").primaryKey(),
		calendarConnectionId: text("calendar_connection_id")
			.notNull()
			.references(() => listingCalendarConnection.id, { onDelete: "cascade" }),
		provider: calendarProviderEnum("provider").notNull(),
		providerChannelId: text("provider_channel_id"),
		providerResourceId: text("provider_resource_id"),
		messageNumber: integer("message_number"),
		resourceState: text("resource_state"),
		status: calendarWebhookEventStatusEnum("status")
			.notNull()
			.default("processed"),
		errorMessage: text("error_message"),
		payload: jsonb("payload").$type<Record<string, unknown>>(),
		receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		processedAt: timestamp("processed_at", {
			withTimezone: true,
			mode: "date",
		}),
		...timestamps,
	},
	(table) => [
		index("calendar_webhook_event_ix_connection_id").on(
			table.calendarConnectionId
		),
		index("calendar_webhook_event_ix_status").on(table.status),
		index("calendar_webhook_event_ix_received_at").on(table.receivedAt),
	]
);

/** Per-booking link to external calendar event (export side — booking pushed to calendar). */
export const bookingCalendarLink = pgTable(
	"booking_calendar_link",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		calendarConnectionId: text("calendar_connection_id").references(
			() => listingCalendarConnection.id,
			{ onDelete: "set null" }
		),
		provider: calendarProviderEnum("provider").notNull(),
		providerEventId: text("provider_event_id"),
		icalUid: text("ical_uid"),
		lastSyncedAt: timestamp("last_synced_at", {
			withTimezone: true,
			mode: "date",
		}),
		syncError: text("sync_error"),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_calendar_link_uq_booking_id").on(table.bookingId),
		index("booking_calendar_link_ix_calendar_connection_id").on(
			table.calendarConnectionId
		),
	]
);
