import type { db } from "@my-app/db";
import type { booking, bookingCancellationRequest } from "@my-app/db/schema/marketplace";
import type { WorkflowContext } from "@my-app/workflows";
import type { CancellationReasonCode } from "./cancellation-reasons";

export type Db = typeof db;
export type BookingRow = typeof booking.$inferSelect;
export type CancellationRequestRow = typeof bookingCancellationRequest.$inferSelect;

export interface CreateBookingInput {
	listingId: string;
	startsAt: Date;
	endsAt: Date;
	passengers?: number;
	contactName?: string;
	contactPhone?: string;
	contactEmail?: string;
	timezone?: string;
	notes?: string;
	specialRequests?: string;
	source: "manual" | "web" | "telegram" | "partner" | "api" | "calendar_sync";
	customerUserId?: string;
	createdByUserId?: string;
	currency?: string;
	discountCode?: string;
}

export interface UpdateBookingStatusInput {
	id: string;
	organizationId: string;
	status:
		| "pending"
		| "awaiting_payment"
		| "confirmed"
		| "in_progress"
		| "completed"
		| "cancelled"
		| "rejected"
		| "no_show"
		| "disputed";
	cancellationReason?: string;
	cancelledByUserId?: string;
	refundAmountCents?: number;
	workflowContext?: WorkflowContext;
}

export interface UpdateBookingScheduleInput {
	id: string;
	organizationId: string;
	startsAt: Date;
	endsAt: Date;
	timezone?: string | null;
	workflowContext?: WorkflowContext;
}

export interface ListOrgBookingsFilter {
	listingId?: string;
	paymentStatus?: BookingRow["paymentStatus"];
	source?: BookingRow["source"];
	status?: BookingRow["status"];
}

export interface ListOrgBookingsInput {
	filter?: ListOrgBookingsFilter;
	page?: {
		limit: number;
		offset: number;
	};
	search?: string;
	sort?: {
		by: "created_at" | "starts_at" | "ends_at" | "status";
		dir: "asc" | "desc";
	};
}

export interface BookingCollectionResult {
	items: BookingRow[];
	total: number;
}

export interface CancellationEvidence {
	type: "photo" | "document" | "video" | "other";
	url: string;
	description?: string;
}

export interface CancellationPolicyOutcome {
	actor: "customer" | "manager";
	policyCode:
		| "customer_early_full_refund"
		| "customer_standard_partial_refund"
		| "customer_late_no_refund"
		| "manager_default_full_refund"
		| "reason_override_refund";
	policyLabel: string;
	policySource: "default_profile" | "reason_override";
	reasonCode?: string;
	hoursUntilStart: number;
	capturedAmountCents: number;
	alreadyRefundedCents: number;
	refundableBaseCents: number;
	refundPercent: number; // 0–100
	suggestedRefundCents: number;
}

export interface RequestCancellationInput {
	bookingId: string;
	organizationId: string;
	requestedByUserId?: string;
	initiatedByRole: "customer" | "manager";
	reason?: string;
	reasonCode?: CancellationReasonCode;
	evidence?: CancellationEvidence[];
}

export interface PublicBookingSurfaceInput {
	listingId: string;
	date: string;
	durationMinutes: number;
	passengers?: number;
	discountCode?: string;
}

export type PublicBookingSlotStatus =
	| "available"
	| "blocked"
	| "notice_too_short"
	| "minimum_duration_not_met";

export interface PublicBookingSlotDiscountPreview {
	code: string;
	status: "applied" | "invalid";
	reasonCode:
		| "PROMOTION_CODE_NOT_FOUND"
		| "PROMOTION_CODE_INACTIVE"
		| "PROMOTION_CODE_NOT_STARTED"
		| "PROMOTION_CODE_EXPIRED"
		| "PROMOTION_CODE_LISTING_MISMATCH"
		| "PROMOTION_CODE_USAGE_LIMIT_REACHED"
		| "PROMOTION_CODE_CUSTOMER_LIMIT_REACHED"
		| "PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET"
		| null;
	reasonLabel: string | null;
	appliedAmountCents: number;
	discountedSubtotalCents: number | null;
	discountedServiceFeeCents: number | null;
	discountedTaxCents: number | null;
	discountedTotalCents: number | null;
}

export interface PublicBookingSlotQuote {
	listingId: string;
	profileId: string;
	currency: string;
	durationMinutes: number;
	baseCents: number;
	adjustmentCents: number;
	subtotalCents: number;
	serviceFeeCents: number;
	taxCents: number;
	totalCents: number;
	hasSpecialPricing: boolean;
	discountPreview: PublicBookingSlotDiscountPreview | null;
}

export interface PublicBookingSurfaceSlot {
	blockReason: string | null;
	blockSource:
		| "booking"
		| "manual"
		| "calendar"
		| "maintenance"
		| "system"
		| null;
	endsAt: string;
	endsAtLabel: string;
	minimumDurationMinutes: number;
	quote: PublicBookingSlotQuote | null;
	startsAt: string;
	startsAtLabel: string;
	status: PublicBookingSlotStatus;
	statusLabel: string;
}

export interface PublicBookingSurfaceSummary {
	availableSlotCount: number;
	blockedSlotCount: number;
	minimumDurationSlotCount: number;
	noticeTooShortSlotCount: number;
	specialPricedSlotCount: number;
	totalSlotCount: number;
}

export interface PublicBookingSurface {
	currency: string | null;
	date: string;
	durationOptionsMinutes: number[];
	listingId: string;
	minimumDurationMinutes: number;
	minimumNoticeMinutes: number;
	passengers: number | null;
	pricingConfigured: boolean;
	requestedDurationMinutes: number;
	requestedDiscountCode: string | null;
	serviceFamily: "boat_rent";
	slotStepMinutes: number;
	slots: PublicBookingSurfaceSlot[];
	summary: PublicBookingSurfaceSummary;
	timezone: string;
}
