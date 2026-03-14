import type { db } from "@my-app/db";
import type {
	booking,
	bookingCancellationRequest,
} from "@my-app/db/schema/marketplace";
import type { WorkflowContext } from "@my-app/workflows";
import type { CancellationReasonCode } from "./cancellation-reasons";

export type Db = typeof db;
export type BookingRow = typeof booking.$inferSelect;
export type CancellationRequestRow =
	typeof bookingCancellationRequest.$inferSelect;

export interface CreateBookingInput {
	contactEmail?: string;
	contactName?: string;
	contactPhone?: string;
	createdByUserId?: string;
	currency?: string;
	customerUserId?: string;
	discountCode?: string;
	endsAt: Date;
	listingId: string;
	notes?: string;
	passengers?: number;
	source: "manual" | "web" | "telegram" | "partner" | "api" | "calendar_sync";
	specialRequests?: string;
	startsAt: Date;
	timezone?: string;
}

export interface UpdateBookingStatusInput {
	cancellationReason?: string;
	cancelledByUserId?: string;
	id: string;
	organizationId: string;
	refundAmountCents?: number;
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
	workflowContext?: WorkflowContext;
}

export interface UpdateBookingScheduleInput {
	endsAt: Date;
	id: string;
	organizationId: string;
	startsAt: Date;
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
	description?: string;
	type: "photo" | "document" | "video" | "other";
	url: string;
}

export interface CancellationPolicyOutcome {
	actor: "customer" | "manager";
	alreadyRefundedCents: number;
	capturedAmountCents: number;
	hoursUntilStart: number;
	policyCode:
		| "customer_early_full_refund"
		| "customer_standard_partial_refund"
		| "customer_late_no_refund"
		| "manager_default_full_refund"
		| "reason_override_refund";
	policyLabel: string;
	policySource: "default_profile" | "reason_override";
	reasonCode?: string;
	refundableBaseCents: number;
	refundPercent: number; // 0–100
	suggestedRefundCents: number;
}

export interface RequestCancellationInput {
	bookingId: string;
	evidence?: CancellationEvidence[];
	initiatedByRole: "customer" | "manager";
	organizationId: string;
	reason?: string;
	reasonCode?: CancellationReasonCode;
	requestedByUserId?: string;
}

export interface PublicBookingSurfaceInput {
	date: string;
	discountCode?: string;
	durationMinutes: number;
	listingId: string;
	passengers?: number;
}

export type PublicBookingSlotStatus =
	| "available"
	| "blocked"
	| "notice_too_short"
	| "minimum_duration_not_met";

export interface PublicBookingSlotDiscountPreview {
	appliedAmountCents: number;
	code: string;
	discountedServiceFeeCents: number | null;
	discountedSubtotalCents: number | null;
	discountedTaxCents: number | null;
	discountedTotalCents: number | null;
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
	status: "applied" | "invalid";
}

export interface PublicBookingSlotQuote {
	adjustmentCents: number;
	baseCents: number;
	currency: string;
	discountPreview: PublicBookingSlotDiscountPreview | null;
	durationMinutes: number;
	hasSpecialPricing: boolean;
	listingId: string;
	profileId: string;
	serviceFeeCents: number;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
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
	requestedDiscountCode: string | null;
	requestedDurationMinutes: number;
	serviceFamily: "boat_rent";
	slotStepMinutes: number;
	slots: PublicBookingSurfaceSlot[];
	summary: PublicBookingSurfaceSummary;
	timezone: string;
}
