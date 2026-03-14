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
import { listing } from "./listings";
import { organizationPaymentConfig } from "./payments";
import { listingPublication } from "./publications";
import {
	bookingPaymentAttemptStatusEnum,
	bookingPaymentStatusEnum,
	bookingSourceEnum,
	bookingStatusEnum,
	calendarSyncStatusEnum,
	cancellationPolicyScopeEnum,
	cancellationRequestStatusEnum,
	discountTypeEnum,
	disputeStatusEnum,
	paymentAdjustmentStatusEnum,
	refundStatusEnum,
	shiftRequestDecisionEnum,
	shiftRequestInitiatorRoleEnum,
	shiftRequestStatusEnum,
} from "./shared";

export const booking = pgTable(
	"booking",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "restrict" }),
		publicationId: text("publication_id")
			.notNull()
			.references(() => listingPublication.id, { onDelete: "restrict" }),
		merchantOrganizationId: text("merchant_organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "restrict" }),
		merchantPaymentConfigId: text("merchant_payment_config_id").references(
			() => organizationPaymentConfig.id,
			{ onDelete: "set null" }
		),
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		source: bookingSourceEnum("source").notNull(),
		status: bookingStatusEnum("status").notNull().default("pending"),
		paymentStatus: bookingPaymentStatusEnum("payment_status")
			.notNull()
			.default("unpaid"),
		calendarSyncStatus: calendarSyncStatusEnum("calendar_sync_status")
			.notNull()
			.default("pending"),
		startsAt: timestamp("starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		endsAt: timestamp("ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		passengers: integer("passengers"),
		contactName: text("contact_name"),
		contactPhone: text("contact_phone"),
		contactEmail: text("contact_email"),
		timezone: text("timezone"),
		basePriceCents: integer("base_price_cents").notNull(),
		discountAmountCents: integer("discount_amount_cents").notNull().default(0),
		totalPriceCents: integer("total_price_cents").notNull(),
		platformCommissionCents: integer("platform_commission_cents")
			.notNull()
			.default(0),
		currency: text("currency").notNull(),
		notes: text("notes"),
		specialRequests: text("special_requests"),
		externalRef: text("external_ref"),
		cancelledAt: timestamp("cancelled_at", {
			withTimezone: true,
			mode: "date",
		}),
		cancelledByUserId: text("cancelled_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cancellationReason: text("cancellation_reason"),
		refundAmountCents: integer("refund_amount_cents").notNull().default(0),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("booking_ix_organization_id").on(table.organizationId),
		index("booking_ix_listing_id").on(table.listingId),
		index("booking_ix_customer_user_id").on(table.customerUserId),
		index("booking_ix_status").on(table.status),
		index("booking_ix_payment_status").on(table.paymentStatus),
		index("booking_ix_starts_at").on(table.startsAt),
		index("booking_ix_publication_id").on(table.publicationId),
		index("booking_ix_merchant_organization_id").on(
			table.merchantOrganizationId
		),
		index("booking_ix_merchant_payment_config_id").on(
			table.merchantPaymentConfigId
		),
		uniqueIndex("booking_uq_org_source_external_ref").on(
			table.organizationId,
			table.source,
			table.externalRef
		),
	]
);

export const bookingDiscountCode = pgTable(
	"booking_discount_code",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		code: text("code").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		discountType: discountTypeEnum("discount_type").notNull(),
		discountValue: integer("discount_value").notNull(),
		maxDiscountCents: integer("max_discount_cents"),
		minimumSubtotalCents: integer("minimum_subtotal_cents")
			.notNull()
			.default(0),
		validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
		validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
		usageLimit: integer("usage_limit"),
		usageCount: integer("usage_count").notNull().default(0),
		perCustomerLimit: integer("per_customer_limit"),
		appliesToListingId: text("applies_to_listing_id").references(
			() => listing.id,
			{ onDelete: "set null" }
		),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("booking_discount_code_ix_organization_id_is_active").on(
			table.organizationId,
			table.isActive
		),
		uniqueIndex("booking_discount_code_uq_org_code").on(
			table.organizationId,
			table.code
		),
		check(
			"booking_discount_code_ck_positive_values",
			sql`${table.discountValue} > 0
				and ${table.minimumSubtotalCents} >= 0
				and (${table.maxDiscountCents} is null or ${table.maxDiscountCents} > 0)
				and (${table.usageLimit} is null or ${table.usageLimit} > 0)
				and (${table.perCustomerLimit} is null or ${table.perCustomerLimit} > 0)
				and ${table.usageCount} >= 0`
		),
		check(
			"booking_discount_code_ck_type_range",
			sql`(${table.discountType} = 'percentage' and ${table.discountValue} between 1 and 100)
				or (${table.discountType} = 'fixed_cents' and ${table.discountValue} > 0)`
		),
		check(
			"booking_discount_code_ck_valid_window",
			sql`${table.validFrom} is null or ${table.validTo} is null or ${table.validTo} > ${table.validFrom}`
		),
	]
);

export const bookingDiscountApplication = pgTable(
	"booking_discount_application",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		discountCodeId: text("discount_code_id")
			.notNull()
			.references(() => bookingDiscountCode.id, { onDelete: "restrict" }),
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		code: text("code").notNull(),
		discountType: discountTypeEnum("discount_type"),
		discountValue: integer("discount_value"),
		appliedAmountCents: integer("applied_amount_cents").notNull(),
		...timestamps,
	},
	(table) => [
		index("booking_discount_application_ix_booking_id").on(table.bookingId),
		index("booking_discount_application_ix_discount_code_id").on(
			table.discountCodeId
		),
		index("booking_discount_application_ix_code_id_customer").on(
			table.discountCodeId,
			table.customerUserId
		),
		uniqueIndex("booking_discount_application_uq_booking_id").on(
			table.bookingId
		),
		check(
			"booking_discount_application_ck_applied_amount",
			sql`${table.appliedAmountCents} >= 0`
		),
	]
);

export const bookingPaymentAttempt = pgTable(
	"booking_payment_attempt",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		provider: text("provider").notNull().default("manual"),
		idempotencyKey: text("idempotency_key").notNull(),
		providerIntentId: text("provider_intent_id"),
		status: bookingPaymentAttemptStatusEnum("status")
			.notNull()
			.default("initiated"),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		failureReason: text("failure_reason"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		processedAt: timestamp("processed_at", {
			withTimezone: true,
			mode: "date",
		}),
		...timestamps,
	},
	(table) => [
		index("booking_payment_attempt_ix_booking_id").on(table.bookingId),
		index("booking_payment_attempt_ix_organization_id").on(
			table.organizationId
		),
		index("booking_payment_attempt_ix_status").on(table.status),
		uniqueIndex("booking_payment_attempt_uq_booking_idempotency").on(
			table.bookingId,
			table.idempotencyKey
		),
		uniqueIndex("booking_payment_attempt_uq_provider_intent").on(
			table.provider,
			table.providerIntentId
		),
	]
);

export const bookingShiftRequest = pgTable(
	"booking_shift_request",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		initiatedByRole:
			shiftRequestInitiatorRoleEnum("initiated_by_role").notNull(),
		status: shiftRequestStatusEnum("status").notNull().default("pending"),
		customerDecision: shiftRequestDecisionEnum("customer_decision")
			.notNull()
			.default("pending"),
		customerDecisionByUserId: text("customer_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		customerDecisionAt: timestamp("customer_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		customerDecisionNote: text("customer_decision_note"),
		managerDecision: shiftRequestDecisionEnum("manager_decision")
			.notNull()
			.default("pending"),
		managerDecisionByUserId: text("manager_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		managerDecisionAt: timestamp("manager_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		managerDecisionNote: text("manager_decision_note"),
		currentStartsAt: timestamp("current_starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		currentEndsAt: timestamp("current_ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		proposedStartsAt: timestamp("proposed_starts_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		proposedEndsAt: timestamp("proposed_ends_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		currentPassengers: integer("current_passengers").notNull(),
		proposedPassengers: integer("proposed_passengers").notNull(),
		currentBasePriceCents: integer("current_base_price_cents")
			.notNull()
			.default(0),
		currentDiscountAmountCents: integer("current_discount_amount_cents")
			.notNull()
			.default(0),
		currentTotalPriceCents: integer("current_total_price_cents")
			.notNull()
			.default(0),
		currentPayNowCents: integer("current_pay_now_cents").notNull().default(0),
		proposedBasePriceCents: integer("proposed_base_price_cents")
			.notNull()
			.default(0),
		proposedDiscountAmountCents: integer("proposed_discount_amount_cents")
			.notNull()
			.default(0),
		proposedTotalPriceCents: integer("proposed_total_price_cents")
			.notNull()
			.default(0),
		proposedPayNowCents: integer("proposed_pay_now_cents").notNull().default(0),
		priceDeltaCents: integer("price_delta_cents").notNull().default(0),
		payNowDeltaCents: integer("pay_now_delta_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		discountCode: text("discount_code"),
		reason: text("reason"),
		rejectedByUserId: text("rejected_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "date" }),
		rejectionReason: text("rejection_reason"),
		appliedByUserId: text("applied_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
		paymentAdjustmentStatus: paymentAdjustmentStatusEnum(
			"payment_adjustment_status"
		)
			.notNull()
			.default("none"),
		paymentAdjustmentAmountCents: integer("payment_adjustment_amount_cents")
			.notNull()
			.default(0),
		paymentAdjustmentReference: text("payment_adjustment_reference"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		...timestamps,
	},
	(table) => [
		index("booking_shift_request_ix_organization_id").on(table.organizationId),
		index("booking_shift_request_ix_status").on(table.status),
		uniqueIndex("booking_shift_request_uq_booking_id").on(table.bookingId),
	]
);

export const bookingDispute = pgTable(
	"booking_dispute",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		raisedByUserId: text("raised_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: disputeStatusEnum("status").notNull().default("open"),
		reasonCode: text("reason_code"),
		details: text("details"),
		resolution: text("resolution"),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
		...timestamps,
	},
	(table) => [
		index("booking_dispute_ix_booking_id").on(table.bookingId),
		index("booking_dispute_ix_organization_id").on(table.organizationId),
		index("booking_dispute_ix_status").on(table.status),
	]
);

export const bookingRefund = pgTable(
	"booking_refund",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		approvedByUserId: text("approved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		processedByUserId: text("processed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		status: refundStatusEnum("status").notNull().default("requested"),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		reason: text("reason"),
		provider: text("provider"),
		externalRefundId: text("external_refund_id"),
		failureReason: text("failure_reason"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
		processedAt: timestamp("processed_at", {
			withTimezone: true,
			mode: "date",
		}),
		...timestamps,
	},
	(table) => [
		index("booking_refund_ix_booking_id").on(table.bookingId),
		index("booking_refund_ix_organization_id").on(table.organizationId),
		index("booking_refund_ix_status").on(table.status),
		uniqueIndex("booking_refund_uq_provider_external_refund_id").on(
			table.provider,
			table.externalRefundId
		),
	]
);

export const bookingCancellationRequest = pgTable(
	"booking_cancellation_request",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		initiatedByRole:
			shiftRequestInitiatorRoleEnum("initiated_by_role").notNull(),
		status: cancellationRequestStatusEnum("status")
			.notNull()
			.default("requested"),
		reason: text("reason"),
		reasonCode: text("reason_code"),
		customerDecision: shiftRequestDecisionEnum("customer_decision")
			.notNull()
			.default("pending"),
		customerDecisionByUserId: text("customer_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		customerDecisionAt: timestamp("customer_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		customerDecisionNote: text("customer_decision_note"),
		managerDecision: shiftRequestDecisionEnum("manager_decision")
			.notNull()
			.default("pending"),
		managerDecisionByUserId: text("manager_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		managerDecisionAt: timestamp("manager_decision_at", {
			withTimezone: true,
			mode: "date",
		}),
		managerDecisionNote: text("manager_decision_note"),
		bookingTotalPriceCents: integer("booking_total_price_cents")
			.notNull()
			.default(0),
		penaltyAmountCents: integer("penalty_amount_cents").notNull().default(0),
		refundAmountCents: integer("refund_amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		refundStatus: refundStatusEnum("refund_status"),
		refundReference: text("refund_reference"),
		appliedByUserId: text("applied_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
		requestedAt: timestamp("requested_at", {
			withTimezone: true,
			mode: "date",
		})
			.default(sql`now()`)
			.notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("booking_cancellation_request_ix_organization_id").on(
			table.organizationId
		),
		index("booking_cancellation_request_ix_status").on(table.status),
		uniqueIndex("booking_cancellation_request_uq_booking_id").on(
			table.bookingId
		),
	]
);

export const cancellationPolicy = pgTable(
	"cancellation_policy",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id").references(() => listing.id, {
			onDelete: "cascade",
		}),
		scope: cancellationPolicyScopeEnum("scope").notNull(),
		name: text("name").notNull(),
		freeWindowHours: integer("free_window_hours").notNull().default(24),
		penaltyBps: integer("penalty_bps").notNull().default(0),
		latePenaltyBps: integer("late_penalty_bps").notNull().default(10_000),
		latePenaltyWindowHours: integer("late_penalty_window_hours")
			.notNull()
			.default(2),
		noShowFullCharge: boolean("no_show_full_charge").notNull().default(true),
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("cancellation_policy_ix_organization_id").on(table.organizationId),
		index("cancellation_policy_ix_listing_id").on(table.listingId),
		uniqueIndex("cancellation_policy_uq_listing_id").on(table.listingId),
		uniqueIndex("cancellation_policy_uq_org_scope").on(
			table.organizationId,
			table.scope
		),
	]
);
