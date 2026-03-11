import { pgEnum } from "drizzle-orm/pg-core";

export const listingStatusValues = [
	"draft",
	"active",
	"maintenance",
	"inactive",
] as const;
export const publicationChannelTypeValues = [
	"own_site",
	"platform_marketplace",
	"partner_site",
	"widget",
] as const;
export const publicationVisibilityValues = [
	"public",
	"unlisted",
	"private",
] as const;
export const merchantTypeValues = ["owner", "platform"] as const;
export const paymentProviderValues = ["cloudpayments", "stripe"] as const;
export const validationStatusValues = [
	"pending",
	"validated",
	"failed",
	"suspended",
] as const;
export const webhookTypeValues = [
	"check",
	"pay",
	"fail",
	"confirm",
	"refund",
	"cancel",
] as const;
export const webhookEventStatusValues = [
	"received",
	"authenticated",
	"processed",
	"failed",
	"rejected",
] as const;
export const bookingSourceValues = [
	"manual",
	"web",
	"telegram",
	"partner",
	"api",
	"calendar_sync",
] as const;
export const bookingStatusValues = [
	"pending",
	"awaiting_payment",
	"confirmed",
	"in_progress",
	"completed",
	"cancelled",
	"rejected",
	"no_show",
	"disputed",
] as const;
export const bookingPaymentStatusValues = [
	"unpaid",
	"pending",
	"partially_paid",
	"paid",
	"refunded",
	"failed",
] as const;
export const calendarSyncStatusValues = [
	"pending",
	"linked",
	"sync_error",
	"detached",
	"not_applicable",
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
export const shiftRequestInitiatorRoleValues = ["customer", "manager"] as const;
export const shiftRequestStatusValues = [
	"pending",
	"approved",
	"rejected",
	"applied",
	"cancelled",
] as const;
export const shiftRequestDecisionValues = [
	"pending",
	"approved",
	"rejected",
] as const;
export const paymentAdjustmentStatusValues = [
	"none",
	"pending",
	"captured",
	"refunded",
	"failed",
] as const;
export const disputeStatusValues = [
	"open",
	"under_review",
	"resolved",
	"rejected",
] as const;
export const refundStatusValues = [
	"requested",
	"approved",
	"processed",
	"failed",
	"rejected",
] as const;
export const reviewStatusValues = [
	"pending",
	"published",
	"hidden",
	"flagged",
] as const;
export const listingAssetKindValues = ["image", "document", "other"] as const;
export const cancellationRequestStatusValues = [
	"requested",
	"pending_review",
	"approved",
	"rejected",
	"applied",
	"cancelled",
] as const;
export const staffAssignmentRoleValues = [
	"primary",
	"backup",
	"assistant",
] as const;
export const cancellationPolicyScopeValues = [
	"listing",
	"organization",
] as const;

export const listingStatusEnum = pgEnum("listing_status", listingStatusValues);
export const publicationChannelTypeEnum = pgEnum(
	"publication_channel_type",
	publicationChannelTypeValues,
);
export const publicationVisibilityEnum = pgEnum(
	"publication_visibility",
	publicationVisibilityValues,
);
export const merchantTypeEnum = pgEnum("merchant_type", merchantTypeValues);
export const paymentProviderEnum = pgEnum(
	"payment_provider",
	paymentProviderValues,
);
export const validationStatusEnum = pgEnum(
	"validation_status",
	validationStatusValues,
);
export const webhookTypeEnum = pgEnum("webhook_type", webhookTypeValues);
export const webhookEventStatusEnum = pgEnum(
	"webhook_event_status",
	webhookEventStatusValues,
);
export const bookingSourceEnum = pgEnum("booking_source", bookingSourceValues);
export const bookingStatusEnum = pgEnum("booking_status", bookingStatusValues);
export const bookingPaymentStatusEnum = pgEnum(
	"booking_payment_status",
	bookingPaymentStatusValues,
);
export const calendarSyncStatusEnum = pgEnum(
	"calendar_sync_status",
	calendarSyncStatusValues,
);
export const discountTypeEnum = pgEnum("discount_type", discountTypeValues);
export const bookingPaymentAttemptStatusEnum = pgEnum(
	"booking_payment_attempt_status",
	bookingPaymentAttemptStatusValues,
);
export const shiftRequestInitiatorRoleEnum = pgEnum(
	"shift_request_initiator_role",
	shiftRequestInitiatorRoleValues,
);
export const shiftRequestStatusEnum = pgEnum(
	"shift_request_status",
	shiftRequestStatusValues,
);
export const shiftRequestDecisionEnum = pgEnum(
	"shift_request_decision",
	shiftRequestDecisionValues,
);
export const paymentAdjustmentStatusEnum = pgEnum(
	"payment_adjustment_status",
	paymentAdjustmentStatusValues,
);
export const disputeStatusEnum = pgEnum("dispute_status", disputeStatusValues);
export const refundStatusEnum = pgEnum("refund_status", refundStatusValues);
export const reviewStatusEnum = pgEnum("review_status", reviewStatusValues);
export const listingAssetKindEnum = pgEnum(
	"listing_asset_kind",
	listingAssetKindValues,
);
export const cancellationRequestStatusEnum = pgEnum(
	"cancellation_request_status",
	cancellationRequestStatusValues,
);
export const staffAssignmentRoleEnum = pgEnum(
	"staff_assignment_role",
	staffAssignmentRoleValues,
);
export const cancellationPolicyScopeEnum = pgEnum(
	"cancellation_policy_scope",
	cancellationPolicyScopeValues,
);
