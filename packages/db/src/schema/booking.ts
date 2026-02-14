import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { boat, boatCalendarConnection } from "./boat";
import { timestamps } from "./columns";

export const bookingStatusValues = [
	"pending",
	"awaiting_payment",
	"confirmed",
	"in_progress",
	"completed",
	"cancelled",
	"no_show",
] as const;

export const bookingSourceValues = [
	"manual",
	"web",
	"telegram",
	"partner",
	"api",
] as const;

export const bookingPaymentStatusValues = [
	"unpaid",
	"partially_paid",
	"paid",
	"refunded",
	"failed",
] as const;

export const bookingCalendarSyncStatusValues = [
	"pending",
	"linked",
	"sync_error",
	"detached",
] as const;

export const bookingCalendarProviderValues = [
	"google",
	"outlook",
	"ical",
	"manual",
] as const;

export const discountTypeValues = ["percentage", "fixed_cents"] as const;
export const bookingPaymentAttemptStatusValues = [
	"initiated",
	"requires_action",
	"authorized",
	"captured",
	"failed",
	"cancelled",
	"refunded",
] as const;
export const bookingCancellationRequestStatusValues = [
	"requested",
	"approved",
	"rejected",
	"withdrawn",
] as const;
export const bookingShiftRequestStatusValues = [
	"pending",
	"approved",
	"rejected",
	"applied",
	"cancelled",
] as const;
export const bookingShiftRequestDecisionValues = [
	"pending",
	"approved",
	"rejected",
] as const;
export const bookingShiftRequestInitiatorRoleValues = [
	"customer",
	"manager",
] as const;
export const bookingShiftRequestPaymentAdjustmentStatusValues = [
	"none",
	"pending",
	"captured",
	"refunded",
	"failed",
] as const;
export const bookingDisputeStatusValues = [
	"open",
	"under_review",
	"resolved",
	"rejected",
] as const;
export const bookingRefundStatusValues = [
	"requested",
	"approved",
	"processed",
	"failed",
	"rejected",
] as const;

export type BookingStatus = (typeof bookingStatusValues)[number];
export type BookingSource = (typeof bookingSourceValues)[number];
export type BookingPaymentStatus = (typeof bookingPaymentStatusValues)[number];
export type BookingCalendarSyncStatus =
	(typeof bookingCalendarSyncStatusValues)[number];
export type BookingCalendarProvider =
	(typeof bookingCalendarProviderValues)[number];
export type DiscountType = (typeof discountTypeValues)[number];
export type BookingPaymentAttemptStatus =
	(typeof bookingPaymentAttemptStatusValues)[number];
export type BookingCancellationRequestStatus =
	(typeof bookingCancellationRequestStatusValues)[number];
export type BookingShiftRequestStatus =
	(typeof bookingShiftRequestStatusValues)[number];
export type BookingShiftRequestDecision =
	(typeof bookingShiftRequestDecisionValues)[number];
export type BookingShiftRequestInitiatorRole =
	(typeof bookingShiftRequestInitiatorRoleValues)[number];
export type BookingShiftRequestPaymentAdjustmentStatus =
	(typeof bookingShiftRequestPaymentAdjustmentStatusValues)[number];
export type BookingDisputeStatus = (typeof bookingDisputeStatusValues)[number];
export type BookingRefundStatus = (typeof bookingRefundStatusValues)[number];

export const booking = sqliteTable(
	"booking",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		boatId: text("boat_id")
			.notNull()
			.references(() => boat.id, { onDelete: "cascade" }),
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		source: text("source", { enum: bookingSourceValues })
			.notNull()
			.default("manual"),
		status: text("status", { enum: bookingStatusValues })
			.notNull()
			.default("pending"),
		paymentStatus: text("payment_status", { enum: bookingPaymentStatusValues })
			.notNull()
			.default("unpaid"),
		calendarSyncStatus: text("calendar_sync_status", {
			enum: bookingCalendarSyncStatusValues,
		})
			.notNull()
			.default("pending"),
		startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
		endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
		passengers: integer("passengers").notNull().default(1),
		contactName: text("contact_name"),
		contactPhone: text("contact_phone"),
		contactEmail: text("contact_email"),
		timezone: text("timezone").notNull().default("UTC"),
		basePriceCents: integer("base_price_cents").notNull().default(0),
		discountAmountCents: integer("discount_amount_cents").notNull().default(0),
		totalPriceCents: integer("total_price_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		notes: text("notes"),
		specialRequests: text("special_requests"),
		externalRef: text("external_ref"),
		cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
		cancelledByUserId: text("cancelled_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cancellationReason: text("cancellation_reason"),
		refundAmountCents: integer("refund_amount_cents"),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		index("booking_organizationId_idx").on(table.organizationId),
		index("booking_boatId_idx").on(table.boatId),
		index("booking_status_idx").on(table.status),
		index("booking_paymentStatus_idx").on(table.paymentStatus),
		index("booking_startsAt_idx").on(table.startsAt),
		index("booking_endsAt_idx").on(table.endsAt),
		index("booking_customerUserId_idx").on(table.customerUserId),
		index("booking_calendarSyncStatus_idx").on(table.calendarSyncStatus),
		uniqueIndex("booking_org_source_externalRef_unique").on(
			table.organizationId,
			table.source,
			table.externalRef
		),
	]
);

export const bookingCalendarLink = sqliteTable(
	"booking_calendar_link",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		boatCalendarConnectionId: text("boat_calendar_connection_id").references(
			() => boatCalendarConnection.id,
			{ onDelete: "set null" }
		),
		provider: text("provider", { enum: bookingCalendarProviderValues })
			.notNull()
			.default("manual"),
		externalCalendarId: text("external_calendar_id"),
		externalEventId: text("external_event_id").notNull(),
		iCalUid: text("ical_uid"),
		externalEventVersion: text("external_event_version"),
		syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
		syncError: text("sync_error"),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_calendar_link_bookingId_unique").on(table.bookingId),
		index("booking_calendar_link_connectionId_idx").on(
			table.boatCalendarConnectionId
		),
		index("booking_calendar_link_provider_idx").on(table.provider),
		uniqueIndex("booking_calendar_link_provider_calendar_event_unique").on(
			table.provider,
			table.externalCalendarId,
			table.externalEventId
		),
	]
);

export const bookingDiscountCode = sqliteTable(
	"booking_discount_code",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		code: text("code").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		discountType: text("discount_type", { enum: discountTypeValues }).notNull(),
		discountValue: integer("discount_value").notNull(),
		maxDiscountCents: integer("max_discount_cents"),
		minimumSubtotalCents: integer("minimum_subtotal_cents")
			.notNull()
			.default(0),
		validFrom: integer("valid_from", { mode: "timestamp_ms" }),
		validTo: integer("valid_to", { mode: "timestamp_ms" }),
		usageLimit: integer("usage_limit"),
		usageCount: integer("usage_count").notNull().default(0),
		perCustomerLimit: integer("per_customer_limit"),
		appliesToBoatId: text("applies_to_boat_id").references(() => boat.id, {
			onDelete: "set null",
		}),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		index("booking_discount_code_organizationId_idx").on(table.organizationId),
		index("booking_discount_code_isActive_idx").on(table.isActive),
		index("booking_discount_code_validFrom_idx").on(table.validFrom),
		index("booking_discount_code_validTo_idx").on(table.validTo),
		index("booking_discount_code_appliesToBoatId_idx").on(
			table.appliesToBoatId
		),
		uniqueIndex("booking_discount_code_org_code_unique").on(
			table.organizationId,
			table.code
		),
	]
);

export const bookingDiscountApplication = sqliteTable(
	"booking_discount_application",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		discountCodeId: text("discount_code_id").references(
			() => bookingDiscountCode.id,
			{
				onDelete: "set null",
			}
		),
		code: text("code").notNull(),
		discountType: text("discount_type", { enum: discountTypeValues }).notNull(),
		discountValue: integer("discount_value").notNull(),
		appliedAmountCents: integer("applied_amount_cents").notNull(),
		appliedAt: integer("applied_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		...timestamps,
	},
	(table) => [
		index("booking_discount_application_discountCodeId_idx").on(
			table.discountCodeId
		),
		uniqueIndex("booking_discount_application_bookingId_unique").on(
			table.bookingId
		),
	]
);

export const bookingPaymentAttempt = sqliteTable(
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
		status: text("status", { enum: bookingPaymentAttemptStatusValues })
			.notNull()
			.default("initiated"),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		failureReason: text("failure_reason"),
		metadata: text("metadata"),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("booking_payment_attempt_bookingId_idx").on(table.bookingId),
		index("booking_payment_attempt_organizationId_idx").on(
			table.organizationId
		),
		index("booking_payment_attempt_status_idx").on(table.status),
		index("booking_payment_attempt_provider_idx").on(table.provider),
		index("booking_payment_attempt_requestedByUserId_idx").on(
			table.requestedByUserId
		),
		uniqueIndex("booking_payment_attempt_booking_idempotency_unique").on(
			table.bookingId,
			table.idempotencyKey
		),
		uniqueIndex("booking_payment_attempt_provider_intent_unique").on(
			table.provider,
			table.providerIntentId
		),
	]
);

export const bookingCancellationRequest = sqliteTable(
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
		reason: text("reason"),
		status: text("status", { enum: bookingCancellationRequestStatusValues })
			.notNull()
			.default("requested"),
		reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
		reviewNote: text("review_note"),
		requestedAt: integer("requested_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_cancellation_request_bookingId_unique").on(
			table.bookingId
		),
		index("booking_cancellation_request_organizationId_idx").on(
			table.organizationId
		),
		index("booking_cancellation_request_status_idx").on(table.status),
		index("booking_cancellation_request_requestedByUserId_idx").on(
			table.requestedByUserId
		),
	]
);

export const bookingShiftRequest = sqliteTable(
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
		initiatedByRole: text("initiated_by_role", {
			enum: bookingShiftRequestInitiatorRoleValues,
		}).notNull(),
		status: text("status", { enum: bookingShiftRequestStatusValues })
			.notNull()
			.default("pending"),
		customerDecision: text("customer_decision", {
			enum: bookingShiftRequestDecisionValues,
		})
			.notNull()
			.default("pending"),
		customerDecisionByUserId: text("customer_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		customerDecisionAt: integer("customer_decision_at", {
			mode: "timestamp_ms",
		}),
		customerDecisionNote: text("customer_decision_note"),
		managerDecision: text("manager_decision", {
			enum: bookingShiftRequestDecisionValues,
		})
			.notNull()
			.default("pending"),
		managerDecisionByUserId: text("manager_decision_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		managerDecisionAt: integer("manager_decision_at", { mode: "timestamp_ms" }),
		managerDecisionNote: text("manager_decision_note"),
		currentStartsAt: integer("current_starts_at", {
			mode: "timestamp_ms",
		}).notNull(),
		currentEndsAt: integer("current_ends_at", {
			mode: "timestamp_ms",
		}).notNull(),
		proposedStartsAt: integer("proposed_starts_at", {
			mode: "timestamp_ms",
		}).notNull(),
		proposedEndsAt: integer("proposed_ends_at", {
			mode: "timestamp_ms",
		}).notNull(),
		currentPassengers: integer("current_passengers").notNull(),
		proposedPassengers: integer("proposed_passengers").notNull(),
		currentBasePriceCents: integer("current_base_price_cents")
			.notNull()
			.default(0),
		currentDiscountAmountCents: integer("current_discount_amount_cents")
			.notNull()
			.default(0),
		proposedBasePriceCents: integer("proposed_base_price_cents")
			.notNull()
			.default(0),
		proposedDiscountAmountCents: integer("proposed_discount_amount_cents")
			.notNull()
			.default(0),
		currentTotalPriceCents: integer("current_total_price_cents")
			.notNull()
			.default(0),
		proposedTotalPriceCents: integer("proposed_total_price_cents")
			.notNull()
			.default(0),
		currentPayNowCents: integer("current_pay_now_cents").notNull().default(0),
		proposedPayNowCents: integer("proposed_pay_now_cents").notNull().default(0),
		priceDeltaCents: integer("price_delta_cents").notNull().default(0),
		payNowDeltaCents: integer("pay_now_delta_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		discountCode: text("discount_code"),
		reason: text("reason"),
		rejectedByUserId: text("rejected_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rejectedAt: integer("rejected_at", { mode: "timestamp_ms" }),
		rejectionReason: text("rejection_reason"),
		appliedByUserId: text("applied_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
		paymentAdjustmentStatus: text("payment_adjustment_status", {
			enum: bookingShiftRequestPaymentAdjustmentStatusValues,
		})
			.notNull()
			.default("none"),
		paymentAdjustmentAmountCents: integer("payment_adjustment_amount_cents")
			.notNull()
			.default(0),
		paymentAdjustmentReference: text("payment_adjustment_reference"),
		metadata: text("metadata"),
		requestedAt: integer("requested_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("booking_shift_request_bookingId_unique").on(table.bookingId),
		index("booking_shift_request_organizationId_idx").on(table.organizationId),
		index("booking_shift_request_status_idx").on(table.status),
		index("booking_shift_request_requestedByUserId_idx").on(
			table.requestedByUserId
		),
	]
);

export const bookingDispute = sqliteTable(
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
		status: text("status", { enum: bookingDisputeStatusValues })
			.notNull()
			.default("open"),
		reasonCode: text("reason_code"),
		details: text("details"),
		resolution: text("resolution"),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("booking_dispute_bookingId_idx").on(table.bookingId),
		index("booking_dispute_organizationId_idx").on(table.organizationId),
		index("booking_dispute_status_idx").on(table.status),
		index("booking_dispute_raisedByUserId_idx").on(table.raisedByUserId),
	]
);

export const bookingRefund = sqliteTable(
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
		status: text("status", { enum: bookingRefundStatusValues })
			.notNull()
			.default("requested"),
		amountCents: integer("amount_cents").notNull().default(0),
		currency: text("currency").notNull().default("RUB"),
		reason: text("reason"),
		provider: text("provider"),
		externalRefundId: text("external_refund_id"),
		failureReason: text("failure_reason"),
		metadata: text("metadata"),
		requestedAt: integer("requested_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("booking_refund_bookingId_idx").on(table.bookingId),
		index("booking_refund_organizationId_idx").on(table.organizationId),
		index("booking_refund_status_idx").on(table.status),
		index("booking_refund_requestedByUserId_idx").on(table.requestedByUserId),
		uniqueIndex("booking_refund_provider_externalRefundId_unique").on(
			table.provider,
			table.externalRefundId
		),
	]
);
