import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { booking } from "./booking";
import { timestamps } from "./columns";

export const affiliateReferralStatusValues = [
	"active",
	"paused",
	"archived",
] as const;

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

export type AffiliateReferralStatus =
	(typeof affiliateReferralStatusValues)[number];
export type AffiliateAttributionSource =
	(typeof affiliateAttributionSourceValues)[number];
export type AffiliatePayoutStatus =
	(typeof affiliatePayoutStatusValues)[number];

export const affiliateReferral = sqliteTable(
	"affiliate_referral",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull(),
		affiliateUserId: text("affiliate_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		name: text("name"),
		status: text("status", { enum: affiliateReferralStatusValues })
			.notNull()
			.default("active"),
		attributionWindowDays: integer("attribution_window_days")
			.notNull()
			.default(30),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		uniqueIndex("affiliate_referral_code_unique").on(table.code),
		index("affiliate_referral_affiliateUserId_idx").on(table.affiliateUserId),
		index("affiliate_referral_organizationId_idx").on(table.organizationId),
		index("affiliate_referral_status_idx").on(table.status),
	]
);

export const bookingAffiliateAttribution = sqliteTable(
	"booking_affiliate_attribution",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		affiliateUserId: text("affiliate_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		referralId: text("referral_id").references(() => affiliateReferral.id, {
			onDelete: "set null",
		}),
		referralCode: text("referral_code").notNull(),
		source: text("source", { enum: affiliateAttributionSourceValues })
			.notNull()
			.default("cookie"),
		clickedAt: integer("clicked_at", { mode: "timestamp_ms" }),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_affiliate_attribution_bookingId_unique").on(
			table.bookingId
		),
		index("booking_affiliate_attribution_organizationId_idx").on(
			table.organizationId
		),
		index("booking_affiliate_attribution_affiliateUserId_idx").on(
			table.affiliateUserId
		),
		index("booking_affiliate_attribution_referralId_idx").on(table.referralId),
	]
);

export const bookingAffiliatePayout = sqliteTable(
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
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		affiliateUserId: text("affiliate_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		commissionAmountCents: integer("commission_amount_cents")
			.notNull()
			.default(0),
		currency: text("currency").notNull().default("RUB"),
		status: text("status", { enum: affiliatePayoutStatusValues })
			.notNull()
			.default("pending"),
		eligibleAt: integer("eligible_at", { mode: "timestamp_ms" }),
		paidAt: integer("paid_at", { mode: "timestamp_ms" }),
		voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
		voidReason: text("void_reason"),
		externalPayoutRef: text("external_payout_ref"),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_affiliate_payout_attributionId_unique").on(
			table.attributionId
		),
		uniqueIndex("booking_affiliate_payout_bookingId_unique").on(
			table.bookingId
		),
		index("booking_affiliate_payout_organizationId_idx").on(
			table.organizationId
		),
		index("booking_affiliate_payout_affiliateUserId_idx").on(
			table.affiliateUserId
		),
		index("booking_affiliate_payout_status_idx").on(table.status),
	]
);
