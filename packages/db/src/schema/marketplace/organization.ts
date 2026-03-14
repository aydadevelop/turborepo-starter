import { sql } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "../auth";
import { timestamps } from "../columns";

export const listingServiceFamilyValues = ["boat_rent", "excursions"] as const;
export type ListingServiceFamily = (typeof listingServiceFamilyValues)[number];
export const organizationManualOverrideScopeValues = [
	"organization",
	"listing",
] as const;
export type OrganizationManualOverrideScope =
	(typeof organizationManualOverrideScopeValues)[number];
export const organizationManualOverrideScopeEnum = pgEnum(
	"organization_manual_override_scope",
	organizationManualOverrideScopeValues,
);

export const organizationSettings = pgTable(
	"organization_settings",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		timezone: text("timezone").notNull().default("UTC"),
		defaultCurrency: text("default_currency").notNull().default("RUB"),
		defaultLanguage: text("default_language").notNull().default("ru"),
		searchLanguage: text("search_language").notNull().default("russian"),
		businessHoursStart: integer("business_hours_start").notNull().default(9),
		businessHoursEnd: integer("business_hours_end").notNull().default(21),
		cancellationFreeWindowHours: integer("cancellation_free_window_hours")
			.notNull()
			.default(24),
		cancellationPenaltyBps: integer("cancellation_penalty_bps")
			.notNull()
			.default(0),
		bookingRequiresApproval: boolean("booking_requires_approval")
			.notNull()
			.default(false),
		contactEmail: text("contact_email"),
		contactPhone: text("contact_phone"),
		websiteUrl: text("website_url"),
		brandConfig: jsonb("brand_config").$type<Record<string, unknown>>(),
		notificationDefaults: jsonb("notification_defaults").$type<
			Record<string, unknown>
		>(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("organization_settings_uq_organization_id").on(
			table.organizationId,
		),
	],
);

export const organizationOnboarding = pgTable(
	"organization_onboarding",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		paymentConfigured: boolean("payment_configured").notNull().default(false),
		calendarConnected: boolean("calendar_connected").notNull().default(false),
		listingPublished: boolean("listing_published").notNull().default(false),
		isComplete: boolean("is_complete").notNull().default(false),
		completedAt: timestamp("completed_at", {
			withTimezone: true,
			mode: "date",
		}),
		lastRecalculatedAt: timestamp("last_recalculated_at", {
			withTimezone: true,
			mode: "date",
		})
			.default(sql`now()`)
			.notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("organization_onboarding_uq_organization_id").on(
			table.organizationId,
		),
		index("organization_onboarding_ix_is_complete").on(table.isComplete),
	],
);

export const organizationManualOverride = pgTable(
	"organization_manual_override",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		scopeType: organizationManualOverrideScopeEnum("scope_type")
			.notNull()
			.default("organization"),
		scopeKey: text("scope_key"),
		code: text("code").notNull(),
		title: text("title").notNull(),
		note: text("note"),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("organization_manual_override_ix_organization_id").on(
			table.organizationId,
		),
		index("organization_manual_override_ix_is_active").on(table.isActive),
		index("organization_manual_override_ix_scope_type").on(table.scopeType),
	],
);

export const listingTypeConfig = pgTable(
	"listing_type_config",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull(),
		serviceFamily: text("service_family")
			.$type<ListingServiceFamily>()
			.notNull()
			.default("boat_rent"),
		label: text("label").notNull(),
		icon: text("icon"),
		metadataJsonSchema: jsonb("metadata_json_schema")
			.$type<Record<string, unknown>>()
			.notNull(),
		defaultAmenityKeys: jsonb("default_amenity_keys").$type<string[]>(),
		requiredFields: jsonb("required_fields").$type<string[]>(),
		supportedPricingModels: jsonb("supported_pricing_models").$type<string[]>(),
		isActive: boolean("is_active").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		...timestamps,
	},
	(table) => [uniqueIndex("listing_type_config_uq_slug").on(table.slug)],
);

export const organizationListingType = pgTable(
	"organization_listing_type",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingTypeSlug: text("listing_type_slug")
			.notNull()
			.references(() => listingTypeConfig.slug, { onDelete: "cascade" }),
		isDefault: boolean("is_default").notNull().default(false),
		config: jsonb("config").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("organization_listing_type_ix_organization_id").on(
			table.organizationId,
		),
		uniqueIndex("organization_listing_type_uq_org_slug").on(
			table.organizationId,
			table.listingTypeSlug,
		),
		uniqueIndex("organization_listing_type_uq_default")
			.on(table.organizationId)
			.where(sql`${table.isDefault} = true`),
	],
);

export const listingLocation = pgTable(
	"listing_location",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		address: text("address"),
		latitude: doublePrecision("latitude"),
		longitude: doublePrecision("longitude"),
		timezone: text("timezone"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("listing_location_ix_organization_id").on(table.organizationId),
	],
);
