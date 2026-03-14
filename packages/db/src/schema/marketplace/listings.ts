import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "../auth";
import { timestamps } from "../columns";
import { listingLocation, listingTypeConfig } from "./organization";
import {
	listingAssetKindEnum,
	listingBoatRentCaptainModeEnum,
	listingBoatRentFuelPolicyEnum,
	listingExcursionGroupFormatEnum,
	listingModerationActionEnum,
	listingStatusEnum,
	storageAccessEnum,
} from "./shared";

export const listing = pgTable(
	"listing",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingTypeSlug: text("listing_type_slug")
			.notNull()
			.references(() => listingTypeConfig.slug, { onDelete: "restrict" }),
		locationId: text("location_id").references(() => listingLocation.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		minimumDurationMinutes: integer("minimum_duration_minutes")
			.notNull()
			.default(60),
		minimumNoticeMinutes: integer("minimum_notice_minutes")
			.notNull()
			.default(0),
		allowShiftRequests: boolean("allow_shift_requests").notNull().default(true),
		workingHoursStart: integer("working_hours_start").notNull().default(9),
		workingHoursEnd: integer("working_hours_end").notNull().default(21),
		timezone: text("timezone").notNull().default("UTC"),
		status: listingStatusEnum("status").notNull().default("draft"),
		isActive: boolean("is_active").notNull().default(true),
		approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
		archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("listing_ix_organization_id").on(table.organizationId),
		index("listing_ix_status").on(table.status),
		index("listing_ix_listing_type_slug").on(table.listingTypeSlug),
		uniqueIndex("listing_uq_org_slug").on(table.organizationId, table.slug),
		check(
			"listing_ck_minimums",
			sql`${table.minimumDurationMinutes} > 0 and ${table.minimumNoticeMinutes} >= 0`,
		),
		check(
			"listing_ck_working_hours",
			sql`${table.workingHoursStart} between 0 and 23 and ${table.workingHoursEnd} between 1 and 24 and ${table.workingHoursEnd} > ${table.workingHoursStart}`,
		),
	],
);

export const listingAmenity = pgTable(
	"listing_amenity",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		label: text("label").notNull(),
		isEnabled: boolean("is_enabled").notNull().default(true),
		value: text("value"),
		...timestamps,
	},
	(table) => [
		index("listing_amenity_ix_listing_id").on(table.listingId),
		uniqueIndex("listing_amenity_uq_listing_key").on(
			table.listingId,
			table.key,
		),
	],
);

export const listingModerationAudit = pgTable(
	"listing_moderation_audit",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		action: listingModerationActionEnum("action").notNull(),
		note: text("note"),
		actedByUserId: text("acted_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		actedAt: timestamp("acted_at", { withTimezone: true, mode: "date" })
			.notNull()
			.default(sql`now()`),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.notNull()
			.default(sql`now()`),
	},
	(table) => [
		index("listing_moderation_audit_ix_listing_id").on(table.listingId),
		index("listing_moderation_audit_ix_organization_id").on(
			table.organizationId,
		),
		index("listing_moderation_audit_ix_acted_by_user_id").on(
			table.actedByUserId,
		),
		index("listing_moderation_audit_ix_acted_at").on(table.actedAt),
	],
);

export const listingBoatRentProfile = pgTable(
	"listing_boat_rent_profile",
	{
		listingId: text("listing_id")
			.primaryKey()
			.references(() => listing.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		capacity: integer("capacity"),
		captainMode: listingBoatRentCaptainModeEnum("captain_mode")
			.notNull()
			.default("captained_only"),
		basePort: text("base_port"),
		departureArea: text("departure_area"),
		fuelPolicy: listingBoatRentFuelPolicyEnum("fuel_policy")
			.notNull()
			.default("included"),
		depositRequired: boolean("deposit_required").notNull().default(false),
		instantBookAllowed: boolean("instant_book_allowed")
			.notNull()
			.default(false),
		...timestamps,
	},
	(table) => [
		index("listing_boat_rent_profile_ix_organization_id").on(
			table.organizationId,
		),
		check(
			"listing_boat_rent_profile_ck_capacity",
			sql`${table.capacity} is null or ${table.capacity} > 0`,
		),
	],
);

export const listingExcursionProfile = pgTable(
	"listing_excursion_profile",
	{
		listingId: text("listing_id")
			.primaryKey()
			.references(() => listing.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		meetingPoint: text("meeting_point"),
		durationMinutes: integer("duration_minutes"),
		groupFormat: listingExcursionGroupFormatEnum("group_format")
			.notNull()
			.default("group"),
		maxGroupSize: integer("max_group_size"),
		primaryLanguage: text("primary_language"),
		ticketsIncluded: boolean("tickets_included").notNull().default(false),
		childFriendly: boolean("child_friendly").notNull().default(false),
		instantBookAllowed: boolean("instant_book_allowed").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_excursion_profile_ix_organization_id").on(
			table.organizationId,
		),
		check(
			"listing_excursion_profile_ck_duration_minutes",
			sql`${table.durationMinutes} is null or ${table.durationMinutes} > 0`,
		),
		check(
			"listing_excursion_profile_ck_max_group_size",
			sql`${table.maxGroupSize} is null or ${table.maxGroupSize} > 0`,
		),
	],
);

export const listingAsset = pgTable(
	"listing_asset",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		kind: listingAssetKindEnum("kind").notNull().default("image"),
		storageProvider: text("storage_provider")
			.notNull()
			.default("listing-public-v1"),
		storageKey: text("storage_key").notNull(),
		access: storageAccessEnum("access").notNull().default("public"),
		mimeType: text("mime_type"),
		altText: text("alt_text"),
		isPrimary: boolean("is_primary").notNull().default(false),
		sortOrder: integer("sort_order").notNull().default(0),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("listing_asset_ix_listing_id").on(table.listingId),
		index("listing_asset_ix_kind").on(table.kind),
		index("listing_asset_ix_storage_provider").on(table.storageProvider),
		uniqueIndex("listing_asset_uq_primary_image")
			.on(table.listingId)
			.where(sql`${table.isPrimary} = true and ${table.kind} = 'image'`),
	],
);
