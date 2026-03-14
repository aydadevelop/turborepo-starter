import {
	booking,
	bookingCancellationRequest,
	bookingPaymentAttempt,
	bookingRefund,
	organizationPaymentConfig,
} from "@my-app/db/schema/marketplace";
import { getPaymentProvider, type PaymentProviderId } from "@my-app/payment";
import type { WorkflowContext } from "@my-app/workflows";
import { createStep, createWorkflow } from "@my-app/workflows";
import { and, desc, eq } from "drizzle-orm";
import { updateBookingStatus } from "../booking-service";
import type { Db } from "../types";

type BookingRow = typeof booking.$inferSelect;
type CancellationRequestRow = typeof bookingCancellationRequest.$inferSelect;
type BookingRefundRow = typeof bookingRefund.$inferSelect;
type CapturedPaymentAttemptRow = typeof bookingPaymentAttempt.$inferSelect & {
	providerIntentId: string;
};

export interface CancellationWorkflowInput {
	appliedByUserId: string;
	organizationId: string;
	requestId: string;
}

export interface CancellationWorkflowResult {
	bookingId: string;
	refundExternalId: string | null;
	refundId: string | null;
	requestId: string;
}

interface LoadedCancellationContext extends CancellationWorkflowInput {
	booking: BookingRow;
	request: CancellationRequestRow;
}

interface WithRefundExecution extends LoadedCancellationContext {
	refund: BookingRefundRow | null;
}

interface WithAppliedState extends WithRefundExecution {
	previousBookingState: Pick<
		BookingRow,
		| "status"
		| "paymentStatus"
		| "refundAmountCents"
		| "cancelledAt"
		| "cancelledByUserId"
		| "cancellationReason"
	>;
	previousRequestState: Pick<
		CancellationRequestRow,
		| "status"
		| "appliedAt"
		| "appliedByUserId"
		| "refundStatus"
		| "refundReference"
	>;
}

// ─── Step definitions ───────────────────────────────────────────────────────

const makeLoadCancellationContextStep = (db: Db) =>
	createStep<CancellationWorkflowInput, LoadedCancellationContext>(
		"load-cancellation-context",
		async (input) => {
			const [request] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(
					and(
						eq(bookingCancellationRequest.id, input.requestId),
						eq(bookingCancellationRequest.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!request) {
				throw new Error("NOT_FOUND");
			}

			if (request.status !== "requested") {
				throw new Error("INVALID_STATE");
			}

			const [bookingRow] = await db
				.select()
				.from(booking)
				.where(
					and(
						eq(booking.id, request.bookingId),
						eq(booking.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!bookingRow) {
				throw new Error("NOT_FOUND");
			}

			return { ...input, request, booking: bookingRow };
		}
	);

const makeExecuteRefundStep = (db: Db) =>
	createStep<LoadedCancellationContext, WithRefundExecution>(
		"execute-refund",
		async (input) => {
			if (input.request.refundAmountCents <= 0) {
				return { ...input, refund: null };
			}

			const paymentAttempt = await loadCapturedPaymentAttempt(
				input.request.bookingId,
				input.organizationId,
				db
			);
			const paymentConfig = await loadActivePaymentConfig(input, db);
			const provider = getPaymentProvider(
				paymentConfig.provider as PaymentProviderId
			);

			const refundResult = await provider.refundPayment(
				{
					amountCents: input.request.refundAmountCents,
					providerPaymentId: paymentAttempt.providerIntentId,
					currency: input.request.currency,
					idempotencyKey: `${input.request.id}:refund`,
				},
				{
					providerId: paymentConfig.provider as PaymentProviderId,
					publicKey: paymentConfig.publicKey ?? undefined,
					credentialKeyVersion: paymentConfig.credentialKeyVersion ?? undefined,
					credentials: parseStoredCredentials(
						paymentConfig.encryptedCredentials
					),
				}
			);

			const now = new Date();
			const [refund] = await db
				.insert(bookingRefund)
				.values({
					id: crypto.randomUUID(),
					bookingId: input.request.bookingId,
					organizationId: input.organizationId,
					requestedByUserId:
						input.request.requestedByUserId ?? input.appliedByUserId,
					approvedByUserId: input.appliedByUserId,
					processedByUserId: input.appliedByUserId,
					status: "processed",
					amountCents: input.request.refundAmountCents,
					currency: input.request.currency,
					reason: resolveCancellationReason(input.request),
					provider: paymentAttempt.provider,
					externalRefundId: refundResult.externalRefundId,
					metadata: {
						cancellationRequestId: input.request.id,
						paymentAttemptId: paymentAttempt.id,
						providerPaymentId: paymentAttempt.providerIntentId,
						reasonCode: input.request.reasonCode,
					},
					requestedAt: now,
					approvedAt: now,
					processedAt: now,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [bookingRefund.provider, bookingRefund.externalRefundId],
					set: {
						status: "processed",
						processedByUserId: input.appliedByUserId,
						approvedByUserId: input.appliedByUserId,
						amountCents: input.request.refundAmountCents,
						currency: input.request.currency,
						reason: resolveCancellationReason(input.request),
						metadata: {
							cancellationRequestId: input.request.id,
							paymentAttemptId: paymentAttempt.id,
							providerPaymentId: paymentAttempt.providerIntentId,
							reasonCode: input.request.reasonCode,
						},
						approvedAt: now,
						processedAt: now,
						updatedAt: now,
					},
				})
				.returning();

			return { ...input, refund: refund ?? null };
		},
		async (output) => {
			if (!output.refund) {
				return;
			}

			await db
				.update(bookingRefund)
				.set({
					status: "rejected",
					failureReason: "Compensated after downstream cancellation failure",
					updatedAt: new Date(),
				})
				.where(eq(bookingRefund.id, output.refund.id));
		}
	);

const makeApplyCancellationStateStep = (db: Db) =>
	createStep<WithRefundExecution, WithAppliedState>(
		"apply-cancellation-state",
		async (input) => {
			const previousBookingState = {
				status: input.booking.status,
				paymentStatus: input.booking.paymentStatus,
				refundAmountCents: input.booking.refundAmountCents,
				cancelledAt: input.booking.cancelledAt,
				cancelledByUserId: input.booking.cancelledByUserId,
				cancellationReason: input.booking.cancellationReason,
			};
			const previousRequestState = {
				status: input.request.status,
				appliedAt: input.request.appliedAt,
				appliedByUserId: input.request.appliedByUserId,
				refundStatus: input.request.refundStatus,
				refundReference: input.request.refundReference,
			};

			await updateBookingStatus(
				{
					id: input.booking.id,
					organizationId: input.organizationId,
					status: "cancelled",
					cancelledByUserId: input.appliedByUserId,
					cancellationReason: resolveCancellationReason(input.request),
				},
				db
			);

			await db
				.update(booking)
				.set({
					refundAmountCents: input.request.refundAmountCents,
					paymentStatus:
						input.request.refundAmountCents > 0
							? "refunded"
							: input.booking.paymentStatus,
					updatedAt: new Date(),
				})
				.where(eq(booking.id, input.booking.id));

			await db
				.update(bookingCancellationRequest)
				.set({
					status: "applied",
					appliedByUserId: input.appliedByUserId,
					appliedAt: new Date(),
					refundStatus: input.refund ? "processed" : null,
					refundReference: input.refund?.externalRefundId ?? null,
					updatedAt: new Date(),
				})
				.where(eq(bookingCancellationRequest.id, input.request.id));

			return {
				...input,
				previousBookingState,
				previousRequestState,
			};
		},
		async (output) => {
			await db
				.update(bookingCancellationRequest)
				.set({
					status: output.previousRequestState.status,
					appliedAt: output.previousRequestState.appliedAt,
					appliedByUserId: output.previousRequestState.appliedByUserId,
					refundStatus: output.previousRequestState.refundStatus,
					refundReference: output.previousRequestState.refundReference,
					updatedAt: new Date(),
				})
				.where(eq(bookingCancellationRequest.id, output.request.id));

			await db
				.update(booking)
				.set({
					status: output.previousBookingState.status,
					paymentStatus: output.previousBookingState.paymentStatus,
					refundAmountCents: output.previousBookingState.refundAmountCents,
					cancelledAt: output.previousBookingState.cancelledAt,
					cancelledByUserId: output.previousBookingState.cancelledByUserId,
					cancellationReason: output.previousBookingState.cancellationReason,
					updatedAt: new Date(),
				})
				.where(eq(booking.id, output.booking.id));
		}
	);

const makeEmitBookingCancelledStep = () =>
	createStep<WithAppliedState, CancellationWorkflowResult>(
		"emit-booking-cancelled",
		async (input, ctx: WorkflowContext) => {
			await ctx.eventBus.emit({
				type: "booking:cancelled",
				organizationId: input.organizationId,
				actorUserId: ctx.actorUserId,
				idempotencyKey: `${ctx.idempotencyKey}:booking:cancelled`,
				data: {
					bookingId: input.booking.id,
					reason: resolveCancellationReason(input.request),
					refundAmountKopeks: input.request.refundAmountCents,
				},
			});

			return {
				bookingId: input.booking.id,
				requestId: input.request.id,
				refundId: input.refund?.id ?? null,
				refundExternalId: input.refund?.externalRefundId ?? null,
			};
		}
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
	const loadCancellationContextStep = makeLoadCancellationContextStep(db);
	const executeRefundStep = makeExecuteRefundStep(db);
	const applyCancellationStateStep = makeApplyCancellationStateStep(db);
	const emitBookingCancelledStep = makeEmitBookingCancelledStep();

	return createWorkflow<CancellationWorkflowInput, CancellationWorkflowResult>(
		"process-cancellation",
		async (input, ctx) => {
			const loaded = await loadCancellationContextStep(input, ctx);
			const withRefund = await executeRefundStep(loaded, ctx);
			const applied = await applyCancellationStateStep(withRefund, ctx);
			return emitBookingCancelledStep(applied, ctx);
		}
	);
};

const loadCapturedPaymentAttempt = async (
	bookingId: string,
	organizationId: string,
	db: Db
): Promise<CapturedPaymentAttemptRow> => {
	const [attempt] = await db
		.select()
		.from(bookingPaymentAttempt)
		.where(
			and(
				eq(bookingPaymentAttempt.bookingId, bookingId),
				eq(bookingPaymentAttempt.organizationId, organizationId),
				eq(bookingPaymentAttempt.status, "captured")
			)
		)
		.orderBy(
			desc(bookingPaymentAttempt.processedAt),
			desc(bookingPaymentAttempt.createdAt)
		)
		.limit(1);

	if (!attempt?.providerIntentId) {
		throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
	}

	return attempt as CapturedPaymentAttemptRow;
};

const loadActivePaymentConfig = async (
	input: LoadedCancellationContext,
	db: Db
) => {
	const configSelector = input.booking.merchantPaymentConfigId
		? and(
				eq(organizationPaymentConfig.id, input.booking.merchantPaymentConfigId),
				eq(organizationPaymentConfig.organizationId, input.organizationId),
				eq(organizationPaymentConfig.isActive, true)
			)
		: and(
				eq(organizationPaymentConfig.organizationId, input.organizationId),
				eq(organizationPaymentConfig.isActive, true)
			);

	const [paymentConfig] = await db
		.select()
		.from(organizationPaymentConfig)
		.where(configSelector)
		.orderBy(desc(organizationPaymentConfig.validatedAt))
		.limit(1);

	if (!paymentConfig) {
		throw new Error("PAYMENT_CONFIG_NOT_FOUND");
	}

	return paymentConfig;
};

const parseStoredCredentials = (
	encryptedCredentials: string
): Record<string, unknown> => {
	const trimmed = encryptedCredentials.trim();
	if (!trimmed) {
		return {};
	}

	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}

		if (typeof parsed === "string" && parsed.trim()) {
			return { apiSecret: parsed.trim() };
		}
	} catch {
		// Fall back to treating the persisted value as the provider secret.
	}

	return { apiSecret: trimmed };
};

const resolveCancellationReason = (request: CancellationRequestRow): string =>
	request.reason ?? request.reasonCode ?? "Cancellation request applied";
