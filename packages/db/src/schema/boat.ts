import { sql } from "drizzle-orm";
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";

export const boatStatusValues = [
	"draft",
	"active",
	"maintenance",
	"inactive",
] as const;

export const boatTypeValues = [
	"motor",
	"sail",
	"catamaran",
	"yacht",
	"other",
] as const;

export const boatAssetTypeValues = ["image", "document"] as const;

export const boatAssetPurposeValues = [
	"gallery",
	"dock",
	"registration",
	"insurance",
	"other",
] as const;

export const boatAssetReviewStatusValues = [
	"pending",
	"approved",
	"rejected",
] as const;

export const calendarProviderValues = [
	"google",
	"outlook",
	"ical",
	"manual",
] as const;

export const calendarSyncStatusValues = [
	"idle",
	"syncing",
	"error",
	"disabled",
] as const;
export const calendarWebhookEventStatusValues = [
	"processed",
	"skipped",
	"failed",
] as const;

export const availabilityBlockSourceValues = [
	"manual",
	"calendar",
	"maintenance",
	"system",
] as const;

export const pricingRuleTypeValues = [
	"duration_discount",
	"time_window",
	"weekend_surcharge",
	"holiday_surcharge",
	"passenger_surcharge",
	"custom",
] as const;

export const pricingAdjustmentTypeValues = [
	"percentage",
	"fixed_cents",
] as const;

export type BoatStatus = (typeof boatStatusValues)[number];
export type BoatType = (typeof boatTypeValues)[number];
export type BoatAssetType = (typeof boatAssetTypeValues)[number];
export type BoatAssetPurpose = (typeof boatAssetPurposeValues)[number];
export type BoatAssetReviewStatus =
	(typeof boatAssetReviewStatusValues)[number];
export type CalendarProvider = (typeof calendarProviderValues)[number];
export type CalendarSyncStatus = (typeof calendarSyncStatusValues)[number];
export type CalendarWebhookEventStatus =
	(typeof calendarWebhookEventStatusValues)[number];
export type AvailabilityBlockSource =
	(typeof availabilityBlockSourceValues)[number];
export type PricingRuleType = (typeof pricingRuleTypeValues)[number];
export type PricingAdjustmentType =
	(typeof pricingAdjustmentTypeValues)[number];

export const boatDock = sqliteTable(
	"boat_dock",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		address: text("address"),
		latitude: real("latitude"),
		longitude: real("longitude"),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("boat_dock_organizationId_idx").on(table.organizationId),
		uniqueIndex("boat_dock_org_slug_unique").on(
			table.organizationId,
			table.slug
		),
	]
);

export const boat = sqliteTable(
	"boat",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		dockId: text("dock_id").references(() => boatDock.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		type: text("type", { enum: boatTypeValues }).notNull().default("other"),
		passengerCapacity: integer("passenger_capacity").notNull().default(1),
		crewCapacity: integer("crew_capacity").notNull().default(0),
		minimumHours: integer("minimum_hours").notNull().default(1),
		minimumNoticeMinutes: integer("minimum_notice_minutes")
			.notNull()
			.default(0),
		workingHoursStart: integer("working_hours_start").notNull().default(9),
		workingHoursEnd: integer("working_hours_end").notNull().default(21),
		timezone: text("timezone").notNull().default("UTC"),
		status: text("status", { enum: boatStatusValues })
			.notNull()
			.default("draft"),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		index("boat_organizationId_idx").on(table.organizationId),
		index("boat_status_idx").on(table.status),
		index("boat_dockId_idx").on(table.dockId),
		uniqueIndex("boat_org_slug_unique").on(table.organizationId, table.slug),
	]
);

export const boatAmenity = sqliteTable(
	"boat_amenity",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		label: text("label"),
		isEnabled: integer("is_enabled", { mode: "boolean" })
			.notNull()
			.default(true),
		value: text("value"),
		...timestamps,
	},
	(table) => [
		index("boat_amenity_boatId_idx").on(table.boatId),
		uniqueIndex("boat_amenity_boat_key_unique").on(table.boatId, table.key),
	]
);

export const boatAsset = sqliteTable(
	"boat_asset",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		assetType: text("asset_type", { enum: boatAssetTypeValues }).notNull(),
		purpose: text("purpose", { enum: boatAssetPurposeValues })
			.notNull()
			.default("gallery"),
		storageKey: text("storage_key").notNull(),
		fileName: text("file_name"),
		mimeType: text("mime_type"),
		sizeBytes: integer("size_bytes"),
		uploadedByUserId: text("uploaded_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		sortOrder: integer("sort_order").notNull().default(0),
		isPrimary: integer("is_primary", { mode: "boolean" })
			.notNull()
			.default(false),
		reviewStatus: text("review_status", {
			enum: boatAssetReviewStatusValues,
		})
			.notNull()
			.default("pending"),
		reviewNote: text("review_note"),
		...timestamps,
	},
	(table) => [
		index("boat_asset_boatId_idx").on(table.boatId),
		index("boat_asset_purpose_idx").on(table.purpose),
		index("boat_asset_uploadedByUserId_idx").on(table.uploadedByUserId),
		uniqueIndex("boat_asset_boat_storageKey_unique").on(
			table.boatId,
			table.storageKey
		),
	]
);

export const boatCalendarConnection = sqliteTable(
	"boat_calendar_connection",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		provider: text("provider", { enum: calendarProviderValues })
			.notNull()
			.default("manual"),
		externalCalendarId: text("external_calendar_id").notNull(),
		syncToken: text("sync_token"),
		watchChannelId: text("watch_channel_id"),
		watchResourceId: text("watch_resource_id"),
		watchExpiresAt: integer("watch_expires_at", { mode: "timestamp_ms" }),
		lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
		syncStatus: text("sync_status", { enum: calendarSyncStatusValues })
			.notNull()
			.default("idle"),
		lastError: text("last_error"),
		isPrimary: integer("is_primary", { mode: "boolean" })
			.notNull()
			.default(false),
		...timestamps,
	},
	(table) => [
		index("boat_calendar_connection_boatId_idx").on(table.boatId),
		index("boat_calendar_connection_provider_idx").on(table.provider),
		uniqueIndex("boat_calendar_connection_boat_provider_external_unique").on(
			table.boatId,
			table.provider,
			table.externalCalendarId
		),
	]
);

export const calendarWebhookEvent = sqliteTable(
	"calendar_webhook_event",
	{
		id: text("id").primaryKey(),
		provider: text("provider", { enum: calendarProviderValues }).notNull(),
		channelId: text("channel_id").notNull(),
		resourceId: text("resource_id").notNull(),
		messageNumber: integer("message_number"),
		resourceState: text("resource_state").notNull(),
		channelToken: text("channel_token"),
		resourceUri: text("resource_uri"),
		calendarConnectionId: text("calendar_connection_id").references(
			() => boatCalendarConnection.id,
			{ onDelete: "set null" }
		),
		status: text("status", { enum: calendarWebhookEventStatusValues })
			.notNull()
			.default("processed"),
		errorMessage: text("error_message"),
		receivedAt: integer("received_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("calendar_webhook_event_provider_channel_idx").on(
			table.provider,
			table.channelId
		),
		index("calendar_webhook_event_status_idx").on(table.status),
		index("calendar_webhook_event_connectionId_idx").on(
			table.calendarConnectionId
		),
		index("calendar_webhook_event_receivedAt_idx").on(table.receivedAt),
		uniqueIndex("calendar_webhook_event_provider_channel_message_unique").on(
			table.provider,
			table.channelId,
			table.messageNumber
		),
	]
);

export const boatAvailabilityRule = sqliteTable(
	"boat_availability_rule",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		dayOfWeek: integer("day_of_week").notNull(),
		startMinute: integer("start_minute").notNull(),
		endMinute: integer("end_minute").notNull(),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("boat_availability_rule_boatId_idx").on(table.boatId),
		index("boat_availability_rule_dayOfWeek_idx").on(table.dayOfWeek),
		uniqueIndex("boat_availability_rule_unique").on(
			table.boatId,
			table.dayOfWeek,
			table.startMinute,
			table.endMinute
		),
	]
);

export const boatAvailabilityBlock = sqliteTable(
	"boat_availability_block",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		calendarConnectionId: text("calendar_connection_id").references(
			() => boatCalendarConnection.id,
			{
				onDelete: "set null",
			}
		),
		source: text("source", { enum: availabilityBlockSourceValues })
			.notNull()
			.default("manual"),
		externalRef: text("external_ref"),
		startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
		endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
		reason: text("reason"),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("boat_availability_block_boatId_idx").on(table.boatId),
		index("boat_availability_block_calendarConnectionId_idx").on(
			table.calendarConnectionId
		),
		index("boat_availability_block_source_idx").on(table.source),
		index("boat_availability_block_startsAt_idx").on(table.startsAt),
		index("boat_availability_block_endsAt_idx").on(table.endsAt),
		uniqueIndex("boat_availability_block_calendar_externalRef_unique").on(
			table.calendarConnectionId,
			table.externalRef
		),
	]
);

export const boatPricingProfile = sqliteTable(
	"boat_pricing_profile",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		currency: text("currency").notNull().default("RUB"),
		baseHourlyPriceCents: integer("base_hourly_price_cents").notNull(),
		minimumHours: integer("minimum_hours").notNull().default(1),
		depositPercentage: integer("deposit_percentage").notNull().default(0),
		serviceFeePercentage: integer("service_fee_percentage")
			.notNull()
			.default(0),
		affiliateFeePercentage: integer("affiliate_fee_percentage")
			.notNull()
			.default(0),
		taxPercentage: integer("tax_percentage").notNull().default(0),
		acquiringFeePercentage: integer("acquiring_fee_percentage")
			.notNull()
			.default(0),
		validFrom: integer("valid_from", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		validTo: integer("valid_to", { mode: "timestamp_ms" }),
		isDefault: integer("is_default", { mode: "boolean" })
			.notNull()
			.default(false),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("boat_pricing_profile_boatId_idx").on(table.boatId),
		index("boat_pricing_profile_isDefault_idx").on(table.isDefault),
		index("boat_pricing_profile_validFrom_idx").on(table.validFrom),
	]
);

export const boatPricingRule = sqliteTable(
	"boat_pricing_rule",
	{
		id: text("id").primaryKey(),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		pricingProfileId: text("pricing_profile_id").references(
			() => boatPricingProfile.id,
			{
				onDelete: "cascade",
			}
		),
		name: text("name").notNull(),
		ruleType: text("rule_type", { enum: pricingRuleTypeValues }).notNull(),
		conditionJson: text("condition_json").notNull().default("{}"),
		adjustmentType: text("adjustment_type", {
			enum: pricingAdjustmentTypeValues,
		}).notNull(),
		adjustmentValue: integer("adjustment_value").notNull(),
		priority: integer("priority").notNull().default(0),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("boat_pricing_rule_boatId_idx").on(table.boatId),
		index("boat_pricing_rule_pricingProfileId_idx").on(table.pricingProfileId),
		index("boat_pricing_rule_priority_idx").on(table.priority),
	]
);
