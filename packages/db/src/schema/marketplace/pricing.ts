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

import { user } from "../auth";
import { timestamps } from "../columns";
import { listing } from "./listings";

export const listingPricingProfile = pgTable(
	"listing_pricing_profile",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		currency: text("currency").notNull(),
		baseHourlyPriceCents: integer("base_hourly_price_cents").notNull(),
		minimumHours: integer("minimum_hours").notNull().default(1),
		depositBps: integer("deposit_bps").notNull().default(0),
		serviceFeeBps: integer("service_fee_bps").notNull().default(0),
		affiliateFeeBps: integer("affiliate_fee_bps").notNull().default(0),
		taxBps: integer("tax_bps").notNull().default(0),
		acquiringFeeBps: integer("acquiring_fee_bps").notNull().default(0),
		validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
		validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
		isDefault: boolean("is_default").notNull().default(false),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("listing_pricing_profile_ix_listing_id").on(table.listingId),
		index("listing_pricing_profile_ix_is_default").on(table.isDefault),
		uniqueIndex("listing_pricing_profile_uq_default")
			.on(table.listingId)
			.where(sql`${table.isDefault} = true and ${table.archivedAt} is null`),
		check(
			"listing_pricing_profile_ck_positive_amounts",
			sql`${table.baseHourlyPriceCents} > 0 and ${table.minimumHours} > 0`
		),
		check(
			"listing_pricing_profile_ck_bps_range",
			sql`${table.depositBps} between 0 and 10000
				and ${table.serviceFeeBps} between 0 and 10000
				and ${table.affiliateFeeBps} between 0 and 10000
				and ${table.taxBps} between 0 and 10000
				and ${table.acquiringFeeBps} between 0 and 10000`
		),
		check(
			"listing_pricing_profile_ck_valid_window",
			sql`${table.validFrom} is null or ${table.validTo} is null or ${table.validTo} > ${table.validFrom}`
		),
	]
);

export const listingPricingRule = pgTable(
	"listing_pricing_rule",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		pricingProfileId: text("pricing_profile_id")
			.notNull()
			.references(() => listingPricingProfile.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		ruleType: text("rule_type").notNull(),
		conditionJson: jsonb("condition_json")
			.$type<Record<string, unknown>>()
			.notNull(),
		adjustmentType: text("adjustment_type").notNull(),
		adjustmentValue: integer("adjustment_value").notNull(),
		priority: integer("priority").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_pricing_rule_ix_listing_id").on(table.listingId),
		index("listing_pricing_rule_ix_pricing_profile_id").on(
			table.pricingProfileId
		),
	]
);

export const platformFeeConfig = pgTable(
	"platform_fee_config",
	{
		id: text("id").primaryKey(),
		currency: text("currency").notNull(),
		platformFeeBps: integer("platform_fee_bps").notNull().default(0),
		affiliateFeeBps: integer("affiliate_fee_bps").notNull().default(0),
		taxBps: integer("tax_bps").notNull().default(0),
		acquiringFeeBps: integer("acquiring_fee_bps").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("platform_fee_config_ix_currency").on(table.currency),
		index("platform_fee_config_ix_is_active").on(table.isActive),
	]
);
