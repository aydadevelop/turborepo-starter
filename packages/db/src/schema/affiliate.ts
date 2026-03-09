import {
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
import { booking } from "./marketplace";

/**
 * Affiliate system: referral codes, booking attribution, and payout tracking.
 *
 * Affiliates are users (not members) who drive traffic via referral links.
 * An affiliate can optionally be an organization (partner_site) that resells
 * or embeds listings on their own channels. Attribution is tracked per-booking
 * with a configurable attribution window.
 *
 * Affiliates do NOT automatically become org members — attribution lives here,
 * not in the auth/membership layer.
 */

export const affiliateStatusValues = ["active", "paused", "archived"] as const;

export const affiliateAttributionSourceValues = [
	"cookie",
	"query",
	"manual",
] as const;

export const affiliatePayoutStatusValues = [
	"pending",
	"eligible",
	"paid",
	"voided",
] as const;

export const affiliateStatusEnum = pgEnum(
	"affiliate_status",
	affiliateStatusValues
);
export const affiliateAttributionSourceEnum = pgEnum(
	"affiliate_attribution_source",
	affiliateAttributionSourceValues
);
export const affiliatePayoutStatusEnum = pgEnum(
	"affiliate_payout_status",
	affiliatePayoutStatusValues
);

/**
 * Affiliate referral code — a trackable link/code assigned to a user.
 * One user can have multiple referral codes (e.g. for different campaigns).
 */
export const affiliateReferral = pgTable(
	"affiliate_referral",
	{
		id: text("id").primaryKey(),
		affiliateUserId: text("affiliate_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** Optional: affiliate can belong to a partner organization. */
		affiliateOrganizationId: text("affiliate_organization_id").references(
			() => organization.id,
			{ onDelete: "set null" }
		),
		code: text("code").notNull(),
		name: text("name"),
		status: affiliateStatusEnum("status").notNull().default("active"),
		attributionWindowDays: integer("attribution_window_days")
			.notNull()
			.default(30),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("affiliate_referral_uq_code").on(table.code),
		index("affiliate_referral_ix_affiliate_user_id").on(table.affiliateUserId),
		index("affiliate_referral_ix_affiliate_organization_id").on(
			table.affiliateOrganizationId
		),
		index("affiliate_referral_ix_status").on(table.status),
	]
);

/**
 * Per-booking affiliate attribution — records which affiliate brought a booking.
 * One booking can have at most one attribution (last-click wins).
 */
export const bookingAffiliateAttribution = pgTable(
	"booking_affiliate_attribution",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		affiliateUserId: text("affiliate_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		referralId: text("referral_id")
			.notNull()
			.references(() => affiliateReferral.id, { onDelete: "restrict" }),
		referralCode: text("referral_code").notNull(),
		source: affiliateAttributionSourceEnum("source").notNull(),
		clickedAt: timestamp("clicked_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_affiliate_attribution_uq_booking_id").on(
			table.bookingId
		),
		index("booking_affiliate_attribution_ix_affiliate_user_id").on(
			table.affiliateUserId
		),
		index("booking_affiliate_attribution_ix_referral_id").on(table.referralId),
	]
);

/**
 * Affiliate commission payout per attributed booking.
 * Tracks lifecycle: pending → eligible → paid (or voided if booking was cancelled/refunded).
 */
export const bookingAffiliatePayout = pgTable(
	"booking_affiliate_payout",
	{
		id: text("id").primaryKey(),
		attributionId: text("attribution_id")
			.notNull()
			.references(() => bookingAffiliateAttribution.id, {
				onDelete: "cascade",
			}),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		affiliateUserId: text("affiliate_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		commissionAmountCents: integer("commission_amount_cents").notNull(),
		currency: text("currency").notNull().default("RUB"),
		status: affiliatePayoutStatusEnum("status").notNull().default("pending"),
		eligibleAt: timestamp("eligible_at", { withTimezone: true, mode: "date" }),
		paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
		voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
		voidReason: text("void_reason"),
		externalPayoutRef: text("external_payout_ref"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_affiliate_payout_uq_attribution_id").on(
			table.attributionId
		),
		index("booking_affiliate_payout_ix_booking_id").on(table.bookingId),
		index("booking_affiliate_payout_ix_affiliate_user_id").on(
			table.affiliateUserId
		),
		index("booking_affiliate_payout_ix_status").on(table.status),
	]
);
