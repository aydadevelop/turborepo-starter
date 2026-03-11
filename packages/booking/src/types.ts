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

export interface ListOrgBookingsFilter {
	listingId?: string;
	status?: BookingRow["status"];
	limit?: number;
	offset?: number;
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
