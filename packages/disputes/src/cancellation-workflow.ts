import { eq } from "drizzle-orm";
import { updateBookingStatus } from "@my-app/booking";
import { bookingRefund } from "@my-app/db/schema/marketplace";
import { createStep, createWorkflow } from "@my-app/workflows";
import type { WorkflowContext } from "@my-app/workflows";
import type {
	CancellationPolicyDecision,
	CancellationPolicyInput,
} from "./cancellation-policy-service";
import { evaluateCancellationPolicy } from "./cancellation-policy-service";
import type { Db } from "./types";

export interface CancellationWorkflowInput extends CancellationPolicyInput {
	/** Free-text reason forwarded to booking:cancelled event. */
	reason?: string;
}

interface WithDecision extends CancellationWorkflowInput {
	decision: CancellationPolicyDecision;
}

interface WithRefund extends WithDecision {
	refundId: string | null;
}

// ─── Step definitions ───────────────────────────────────────────────────────

const evaluatePolicyStep = createStep<CancellationWorkflowInput, WithDecision>(
	"evaluate-cancellation-policy",
	async (input) => {
		const decision = evaluateCancellationPolicy(input);
		return { ...input, decision };
	},
);

/**
 * Creates the applyRefundStep closed over `db`.
 * Inserts a `bookingRefund` row (status: requested) and compensates by
 * marking it reversed if a downstream step fails.
 */
const makeApplyRefundStep = (db: Db) =>
	createStep<WithDecision, WithRefund>(
		"apply-refund",
		async (input) => {
			const { decision } = input;
			if (decision.suggestedRefundCents <= 0) {
				return { ...input, refundId: null };
			}

			const refundId = crypto.randomUUID();
			await db.insert(bookingRefund).values({
				id: refundId,
				bookingId: input.bookingId,
				organizationId: input.organizationId,
				status: "requested",
				amountCents: decision.suggestedRefundCents,
				currency: "RUB",
				reason: input.reason ?? `Cancellation policy: ${decision.policyCode} (${decision.actor})`,
				metadata: {
					policyCode: decision.policyCode,
					policyLabel: decision.policyLabel,
					policySource: decision.policySource,
					actor: decision.actor,
					reasonCode: decision.reasonCode,
					refundPercent: decision.refundPercent,
				},
				requestedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			return { ...input, refundId };
		},
		async (output) => {
			if (!output.refundId) return;
			await db
				.update(bookingRefund)
				.set({ status: "rejected", updatedAt: new Date() })
				.where(eq(bookingRefund.id, output.refundId));
		},
	);

const makeUpdateBookingCancelledStep = (db: Db) =>
	createStep<WithRefund, WithRefund>(
		"update-booking-cancelled",
		async (input) => {
			await updateBookingStatus(
				{
					id: input.bookingId,
					organizationId: input.organizationId,
					status: "cancelled",
					cancellationReason: input.reason,
				},
				db,
			);
			return input;
		},
	);

const makeEmitBookingCancelledStep = () =>
	createStep<WithRefund, WithRefund>(
		"emit-booking-cancelled",
		async (input, ctx: WorkflowContext) => {
			await ctx.eventBus.emit({
				type: "booking:cancelled",
				organizationId: input.organizationId,
				actorUserId: ctx.actorUserId,
				idempotencyKey: `cancellation:${input.bookingId}`,
				data: {
					bookingId: input.bookingId,
					reason: input.reason ?? `${input.decision.policyCode}`,
					refundAmountKopeks: input.decision.suggestedRefundCents,
				},
			});
			return input;
		},
	);

/**
 * Factory that creates the processCancellationWorkflow bound to a `db` instance.
 *
 * @example
 * ```typescript
 * import { db } from "@my-app/db";
 * const workflow = processCancellationWorkflow(db);
 * const result = await workflow.execute(input, ctx);
 * ```
 */
export const processCancellationWorkflow = (db: Db) => {
	const applyRefundStep = makeApplyRefundStep(db);
	const updateBookingCancelledStep = makeUpdateBookingCancelledStep(db);
	const emitBookingCancelledStep = makeEmitBookingCancelledStep();

	return createWorkflow<CancellationWorkflowInput, WithRefund>(
		"process-cancellation",
		async (input, ctx) => {
			const withDecision = await evaluatePolicyStep(input, ctx);
			const withRefund = await applyRefundStep(withDecision, ctx);
			const updated = await updateBookingCancelledStep(withRefund, ctx);
			return emitBookingCancelledStep(updated, ctx);
		},
	);
};
