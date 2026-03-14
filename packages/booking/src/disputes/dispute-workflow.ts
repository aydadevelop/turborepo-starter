import { bookingDispute } from "@my-app/db/schema/marketplace";
import { createStep, createWorkflow } from "@my-app/workflows";
import { eq } from "drizzle-orm";
import type { Db } from "../types";

export interface OpenDisputeInput {
	bookingId: string;
	details?: string;
	organizationId: string;
	raisedByUserId?: string;
	reasonCode?: string;
}

interface WithDisputeId extends OpenDisputeInput {
	disputeId: string;
}

export interface ResolveDisputeInput {
	bookingId: string;
	disputeId: string;
	organizationId: string;
	resolution: string;
	resolvedByUserId?: string;
}

// ─── Step definitions ───────────────────────────────────────────────────────

const makeOpenDisputeStep = (db: Db) =>
	createStep<OpenDisputeInput, WithDisputeId>(
		"open-dispute",
		async (input, ctx) => {
			const disputeId = crypto.randomUUID();
			await db.insert(bookingDispute).values({
				id: disputeId,
				bookingId: input.bookingId,
				organizationId: input.organizationId,
				raisedByUserId: input.raisedByUserId ?? null,
				status: "open",
				reasonCode: input.reasonCode ?? null,
				details: input.details ?? null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await ctx.eventBus.emit({
				type: "dispute:opened",
				organizationId: input.organizationId,
				actorUserId: ctx.actorUserId,
				idempotencyKey: `dispute:opened:${disputeId}`,
				data: { disputeId, bookingId: input.bookingId },
			});

			return { ...input, disputeId };
		},
	);

const makeResolveDisputeStep = (db: Db) =>
	createStep<ResolveDisputeInput, ResolveDisputeInput>(
		"resolve-dispute",
		async (input, ctx) => {
			await db
				.update(bookingDispute)
				.set({
					status: "resolved",
					resolution: input.resolution,
					resolvedByUserId: input.resolvedByUserId ?? null,
					resolvedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(bookingDispute.id, input.disputeId));

			await ctx.eventBus.emit({
				type: "dispute:resolved",
				organizationId: input.organizationId,
				actorUserId: ctx.actorUserId,
				idempotencyKey: `dispute:resolved:${input.disputeId}`,
				data: { disputeId: input.disputeId, resolution: input.resolution },
			});

			return input;
		},
	);

/**
 * Factory that creates the processDisputeWorkflow bound to a `db` instance.
 *
 * The dispute workflow has two sequential steps shared across two exported
 * workflow instances for clarity:
 * - `openDisputeWorkflow`: Creates the dispute and emits `dispute:opened`
 * - `resolveDisputeWorkflow`: Marks resolved and emits `dispute:resolved`
 */
export const processDisputeWorkflow = (db: Db) => {
	const openDisputeStep = makeOpenDisputeStep(db);
	const resolveDisputeStep = makeResolveDisputeStep(db);

	return {
		open: createWorkflow<OpenDisputeInput, WithDisputeId>(
			"open-dispute",
			async (input, ctx) => openDisputeStep(input, ctx),
		),
		resolve: createWorkflow<ResolveDisputeInput, ResolveDisputeInput>(
			"resolve-dispute",
			async (input, ctx) => resolveDisputeStep(input, ctx),
		),
	};
};
