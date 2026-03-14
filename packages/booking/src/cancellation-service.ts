import {
	booking,
	bookingCancellationRequest,
	bookingPaymentAttempt,
	bookingRefund,
	cancellationPolicy,
	organizationSettings,
} from "@my-app/db/schema/marketplace";
import { and, desc, eq, notInArray, sql, sum } from "drizzle-orm";
import {
	type CancellationReasonCode,
	cancellationReasonCatalog,
} from "./cancellation-reasons";
import type {
	CancellationPolicyOutcome,
	CancellationRequestRow,
	Db,
	RequestCancellationInput,
} from "./types";

// ─── 1. resolveCancellationPolicy ───────────────────────────────────────────
// Priority: listing-scoped → org-scoped → organizationSettings defaults
async function resolveCancellationPolicy(
	organizationId: string,
	listingId: string,
	db: Db,
): Promise<{
	freeWindowHours: number;
	penaltyBps: number;
	latePenaltyBps: number;
	latePenaltyWindowHours: number;
}> {
	// 1. Listing-scoped first
	const [listingPolicy] = await db
		.select()
		.from(cancellationPolicy)
		.where(
			and(
				eq(cancellationPolicy.listingId, listingId),
				eq(cancellationPolicy.isActive, true),
			),
		)
		.limit(1);
	if (listingPolicy) {
		return listingPolicy;
	}

	// 2. Org-scoped
	const [orgPolicy] = await db
		.select()
		.from(cancellationPolicy)
		.where(
			and(
				eq(cancellationPolicy.organizationId, organizationId),
				eq(cancellationPolicy.scope, "organization"),
				eq(cancellationPolicy.isActive, true),
			),
		)
		.limit(1);
	if (orgPolicy) {
		return orgPolicy;
	}

	// 3. Org settings fallback
	const [settings] = await db
		.select({
			freeWindowHours: organizationSettings.cancellationFreeWindowHours,
			penaltyBps: organizationSettings.cancellationPenaltyBps,
		})
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, organizationId))
		.limit(1);

	return {
		freeWindowHours: settings?.freeWindowHours ?? 24,
		penaltyBps: settings?.penaltyBps ?? 0,
		latePenaltyBps: 10_000,
		latePenaltyWindowHours: 2,
	};
}

// ─── 2. fetchCapturedAmountCents ─────────────────────────────────────────────
// SUM of bookingPaymentAttempt.amountCents WHERE status='captured'
async function fetchCapturedAmountCents(
	bookingId: string,
	db: Db,
): Promise<number> {
	const [row] = await db
		.select({ total: sum(bookingPaymentAttempt.amountCents) })
		.from(bookingPaymentAttempt)
		.where(
			and(
				eq(bookingPaymentAttempt.bookingId, bookingId),
				eq(bookingPaymentAttempt.status, "captured"),
			),
		);
	return Number(row?.total ?? 0);
}

// ─── 3. fetchProcessedRefundSumCents ─────────────────────────────────────────
// SUM of bookingRefund.amountCents WHERE status='processed'
async function fetchProcessedRefundSumCents(
	bookingId: string,
	db: Db,
): Promise<number> {
	const [row] = await db
		.select({ total: sum(bookingRefund.amountCents) })
		.from(bookingRefund)
		.where(
			and(
				eq(bookingRefund.bookingId, bookingId),
				eq(bookingRefund.status, "processed"),
			),
		);
	return Number(row?.total ?? 0);
}

// ─── 4. resolveDefaultPolicyByActor ──────────────────────────────────────────
// Customer: 3-tier time window. Manager: flat 100%.
function resolveDefaultPolicyByActor(
	actor: "customer" | "manager",
	hoursUntilStart: number,
	policy: {
		freeWindowHours: number;
		penaltyBps: number;
		latePenaltyBps: number;
		latePenaltyWindowHours: number;
	},
): {
	policyCode: CancellationPolicyOutcome["policyCode"];
	policyLabel: string;
	refundPercent: number;
} {
	if (actor === "manager") {
		return {
			policyCode: "manager_default_full_refund",
			policyLabel: "Manager cancellation — full refund",
			refundPercent: 100,
		};
	}
	if (hoursUntilStart >= policy.freeWindowHours) {
		return {
			policyCode: "customer_early_full_refund",
			policyLabel: "Within free cancellation window",
			refundPercent: 100,
		};
	}
	if (hoursUntilStart < policy.latePenaltyWindowHours) {
		const pct = Math.round(policy.latePenaltyBps / 100);
		return {
			policyCode: "customer_late_no_refund",
			policyLabel: `Late cancellation — ${pct}% penalty`,
			refundPercent: 100 - pct,
		};
	}
	const pct = Math.round(policy.penaltyBps / 100);
	return {
		policyCode: "customer_standard_partial_refund",
		policyLabel: `Standard cancellation — ${pct}% penalty`,
		refundPercent: 100 - pct,
	};
}

// ─── 5. resolveReasonOverride ─────────────────────────────────────────────────
// Returns override refundPercent if reason catalog specifies one for this actor, else null
function resolveReasonOverride(
	actor: "customer" | "manager",
	reasonCode: CancellationReasonCode,
): number | null {
	const entry = cancellationReasonCatalog[reasonCode];
	if (!entry.allowedActors.includes(actor)) {
		throw new Error("REASON_CODE_NOT_ALLOWED");
	}
	return entry.refundOverride?.[actor] ?? null;
}

// ─── 6. computeCancellationPolicyOutcome ─────────────────────────────────────
export function computeCancellationPolicyOutcome(
	actor: "customer" | "manager",
	startsAt: Date,
	capturedAmountCents: number,
	alreadyRefundedCents: number,
	policy: {
		freeWindowHours: number;
		penaltyBps: number;
		latePenaltyBps: number;
		latePenaltyWindowHours: number;
	},
	reasonCode?: CancellationReasonCode,
): CancellationPolicyOutcome {
	const refundableBaseCents = Math.max(
		capturedAmountCents - alreadyRefundedCents,
		0,
	);
	const hoursUntilStart = (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);

	let base = resolveDefaultPolicyByActor(actor, hoursUntilStart, policy);
	let policySource: CancellationPolicyOutcome["policySource"] =
		"default_profile";

	if (reasonCode) {
		const override = resolveReasonOverride(actor, reasonCode);
		if (override !== null) {
			base = {
				policyCode: "reason_override_refund",
				policyLabel: cancellationReasonCatalog[reasonCode].label,
				refundPercent: override,
			};
			policySource = "reason_override";
		}
	}

	const suggestedRefundCents = Math.min(
		refundableBaseCents,
		Math.floor((refundableBaseCents * base.refundPercent) / 100),
	);

	return {
		actor,
		policyCode: base.policyCode,
		policyLabel: base.policyLabel,
		policySource,
		reasonCode,
		hoursUntilStart,
		capturedAmountCents,
		alreadyRefundedCents,
		refundableBaseCents,
		refundPercent: base.refundPercent,
		suggestedRefundCents,
	};
}

// ─── 7. requestCancellation (PREVIEW) ─────────────────────────────────────────
// Validates booking state, checks for duplicate, computes outcome, inserts request row.
// Does NOT cancel the booking or insert a refund row — that is applyCancellation's job.
export async function requestCancellation(
	input: RequestCancellationInput,
	db: Db,
): Promise<{
	request: CancellationRequestRow;
	outcome: CancellationPolicyOutcome;
}> {
	// 1. Load booking
	const [row] = await db
		.select()
		.from(booking)
		.where(
			and(
				eq(booking.id, input.bookingId),
				eq(booking.organizationId, input.organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new Error("NOT_FOUND");
	}

	// 2. Cancellable state guard
	const cancellableStatuses = [
		"pending",
		"awaiting_payment",
		"confirmed",
	] as const;
	if (!(cancellableStatuses as readonly string[]).includes(row.status)) {
		throw new Error("INVALID_STATE");
	}

	// 3. Reason code validation
	if (input.reasonCode) {
		const entry = cancellationReasonCatalog[input.reasonCode];
		if (!entry) {
			throw new Error("INVALID_REASON_CODE");
		}
		if (!entry.allowedActors.includes(input.initiatedByRole)) {
			throw new Error("REASON_CODE_NOT_ALLOWED");
		}
		if (
			entry.requiresEvidence &&
			(!input.evidence || input.evidence.length === 0)
		) {
			throw new Error("EVIDENCE_REQUIRED");
		}
	}

	// 4. Duplicate guard — unique index on bookingId prevents >1 active request
	const [existing] = await db
		.select({ id: bookingCancellationRequest.id })
		.from(bookingCancellationRequest)
		.where(eq(bookingCancellationRequest.bookingId, input.bookingId))
		.limit(1);
	if (existing) {
		throw new Error("DUPLICATE_REQUEST");
	}

	// 5. Compute outcome from real captured amounts (NOT booking.totalPriceCents)
	const [capturedAmountCents, alreadyRefundedCents] = await Promise.all([
		fetchCapturedAmountCents(input.bookingId, db),
		fetchProcessedRefundSumCents(input.bookingId, db),
	]);
	const policy = await resolveCancellationPolicy(
		input.organizationId,
		row.listingId,
		db,
	);
	const outcome = computeCancellationPolicyOutcome(
		input.initiatedByRole,
		row.startsAt,
		capturedAmountCents,
		alreadyRefundedCents,
		policy,
		input.reasonCode,
	);

	// 6. Insert request row with snapshot
	const [request] = await db
		.insert(bookingCancellationRequest)
		.values({
			id: crypto.randomUUID(),
			bookingId: input.bookingId,
			organizationId: input.organizationId,
			requestedByUserId: input.requestedByUserId,
			initiatedByRole: input.initiatedByRole,
			status: "requested",
			reason: input.reason,
			reasonCode: input.reasonCode,
			bookingTotalPriceCents: outcome.capturedAmountCents,
			penaltyAmountCents:
				outcome.capturedAmountCents - outcome.suggestedRefundCents,
			refundAmountCents: outcome.suggestedRefundCents,
			currency: row.currency ?? "RUB",
		})
		.returning();
	if (!request) {
		throw new Error("REQUEST_CREATE_FAILED");
	}

	return { request, outcome };
}

// ─── 8. applyCancellation (COMMIT) ───────────────────────────────────────────
// Uses stored snapshot — never recalculates. Idempotent via externalRefundId.
export async function applyCancellation(
	requestId: string,
	organizationId: string,
	appliedByUserId: string,
	db: Db,
): Promise<{ request: CancellationRequestRow; refundId: string | null }> {
	const [request] = await db
		.select()
		.from(bookingCancellationRequest)
		.where(
			and(
				eq(bookingCancellationRequest.id, requestId),
				eq(bookingCancellationRequest.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!request) {
		throw new Error("NOT_FOUND");
	}
	if (request.status !== "requested") {
		throw new Error("INVALID_STATE");
	}

	const now = new Date();
	const externalRefundId = `booking:${request.bookingId}:policy-auto`;

	const result = await db.transaction(async (tx) => {
		const [updatedRequest] = await tx
			.update(bookingCancellationRequest)
			.set({
				status: "applied",
				appliedByUserId,
				appliedAt: now,
				updatedAt: sql`now()`,
			})
			.where(eq(bookingCancellationRequest.id, requestId))
			.returning();

		await tx
			.update(booking)
			.set({
				status: "cancelled",
				cancelledAt: now,
				cancelledByUserId: appliedByUserId,
				cancellationReason: request.reason,
				refundAmountCents: request.refundAmountCents,
				updatedAt: sql`now()`,
			})
			.where(eq(booking.id, request.bookingId));

		let insertedRefundId: string | null = null;
		if (request.refundAmountCents > 0) {
			insertedRefundId = crypto.randomUUID();
			// ON CONFLICT DO NOTHING makes this idempotent
			await tx
				.insert(bookingRefund)
				.values({
					id: insertedRefundId,
					bookingId: request.bookingId,
					organizationId,
					requestedByUserId: appliedByUserId,
					approvedByUserId: appliedByUserId,
					status: "requested",
					amountCents: request.refundAmountCents,
					currency: request.currency,
					provider: "policy",
					externalRefundId,
				})
				.onConflictDoNothing({
					target: [bookingRefund.provider, bookingRefund.externalRefundId],
				});
		}
		if (!updatedRequest) {
			throw new Error("NOT_FOUND");
		}
		return { updatedRequest, refundId: insertedRefundId };
	});

	return { request: result.updatedRequest, refundId: result.refundId };
}

// ─── 9. Query helpers ─────────────────────────────────────────────────────────
export async function getActiveCancellationRequest(
	bookingId: string,
	organizationId: string,
	db: Db,
): Promise<CancellationRequestRow | null> {
	const [row] = await db
		.select()
		.from(bookingCancellationRequest)
		.where(
			and(
				eq(bookingCancellationRequest.bookingId, bookingId),
				eq(bookingCancellationRequest.organizationId, organizationId),
				notInArray(bookingCancellationRequest.status, [
					"rejected",
					"cancelled",
				]),
			),
		)
		.limit(1);
	return row ?? null;
}

export function listOrgCancellationRequests(
	organizationId: string,
	db: Db,
): Promise<CancellationRequestRow[]> {
	return db
		.select()
		.from(bookingCancellationRequest)
		.where(eq(bookingCancellationRequest.organizationId, organizationId))
		.orderBy(desc(bookingCancellationRequest.requestedAt));
}
