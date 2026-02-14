import { db } from "@full-stack-cf-app/db";
import { organization } from "@full-stack-cf-app/db/schema/auth";
import {
	booking,
	bookingPaymentAttempt,
	bookingRefund,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import z from "zod";
import {
	type BookingCancellationEvidence,
	type BookingCancellationPolicyActor,
	type BookingCancellationPolicyProfile,
	type BookingCancellationReasonCode,
	bookingCancellationReasonCatalog,
	defaultBookingCancellationPolicyProfile,
} from "./policy.templates";

export type BookingCancellationActor = BookingCancellationPolicyActor;

type CancellationPolicyCode =
	| "customer_early_full_refund"
	| "customer_standard_partial_refund"
	| "customer_late_refund"
	| "owner_default_refund"
	| "system_default_refund"
	| "reason_override_refund";

type CancellationPolicySource = "default_profile" | "reason_override";

export interface CancellationPolicyOutcome {
	actor: BookingCancellationActor;
	policyCode: CancellationPolicyCode;
	policyLabel: string;
	policySource: CancellationPolicySource;
	reasonCode?: BookingCancellationReasonCode;
	reasonLabel?: string;
	evidenceCount: number;
	refundPercent: number;
	hoursUntilStart: number;
	capturedAmountCents: number;
	alreadyRefundedCents: number;
	refundableBaseCents: number;
	suggestedRefundCents: number;
}

export interface AppliedCancellationRefund {
	refundId: string;
	amountCents: number;
}

export interface AppliedCancellationPolicyResult {
	outcome: CancellationPolicyOutcome;
	refund: AppliedCancellationRefund | null;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const AUTO_POLICY_REFUND_PROVIDER = "cancellation_policy_auto";

const cancellationPolicyMetadataSchema = z
	.object({
		cancellationPolicy: z
			.object({
				customer: z
					.object({
						fullRefundHoursBeforeStart: z.number().min(0).optional(),
						partialRefundHoursBeforeStart: z.number().min(0).optional(),
						partialRefundPercent: z.number().min(0).max(100).optional(),
						lateRefundPercent: z.number().min(0).max(100).optional(),
					})
					.optional(),
				owner: z
					.object({
						defaultRefundPercent: z.number().min(0).max(100).optional(),
					})
					.optional(),
				system: z
					.object({
						beforeStartRefundPercent: z.number().min(0).max(100).optional(),
						afterStartRefundPercent: z.number().min(0).max(100).optional(),
					})
					.optional(),
			})
			.optional(),
	})
	.passthrough();

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100);

const toPolicyExternalRefundId = (bookingId: string) =>
	`booking:${bookingId}:policy-auto`;

const getSqliteErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "";
};

const isUniqueConstraintError = (error: unknown) => {
	const message = getSqliteErrorMessage(error).toLowerCase();
	return message.includes("unique") || message.includes("constraint");
};

const resolvePolicyProfile = (
	metadataRaw: string | null | undefined
): BookingCancellationPolicyProfile => {
	if (!metadataRaw) {
		return defaultBookingCancellationPolicyProfile;
	}

	try {
		const parsedJson = JSON.parse(metadataRaw);
		const parsed = cancellationPolicyMetadataSchema.safeParse(parsedJson);
		if (!(parsed.success && parsed.data.cancellationPolicy)) {
			return defaultBookingCancellationPolicyProfile;
		}

		const overrides = parsed.data.cancellationPolicy;
		const base = defaultBookingCancellationPolicyProfile;
		return {
			customer: {
				fullRefundHoursBeforeStart:
					overrides.customer?.fullRefundHoursBeforeStart ??
					base.customer.fullRefundHoursBeforeStart,
				partialRefundHoursBeforeStart:
					overrides.customer?.partialRefundHoursBeforeStart ??
					base.customer.partialRefundHoursBeforeStart,
				partialRefundPercent:
					overrides.customer?.partialRefundPercent ??
					base.customer.partialRefundPercent,
				lateRefundPercent:
					overrides.customer?.lateRefundPercent ??
					base.customer.lateRefundPercent,
			},
			owner: {
				defaultRefundPercent:
					overrides.owner?.defaultRefundPercent ??
					base.owner.defaultRefundPercent,
			},
			system: {
				beforeStartRefundPercent:
					overrides.system?.beforeStartRefundPercent ??
					base.system.beforeStartRefundPercent,
				afterStartRefundPercent:
					overrides.system?.afterStartRefundPercent ??
					base.system.afterStartRefundPercent,
			},
		};
	} catch {
		return defaultBookingCancellationPolicyProfile;
	}
};

const resolveDefaultPolicyByActor = (params: {
	actor: BookingCancellationActor;
	hoursUntilStart: number;
	now: Date;
	bookingStartsAt: Date;
	policyProfile: BookingCancellationPolicyProfile;
}) => {
	if (params.actor === "owner") {
		return {
			policyCode: "owner_default_refund" as const,
			policyLabel: "Owner cancellation policy",
			refundPercent: clampPercent(
				params.policyProfile.owner.defaultRefundPercent
			),
		};
	}

	if (params.actor === "system") {
		const refundPercent =
			params.now < params.bookingStartsAt
				? params.policyProfile.system.beforeStartRefundPercent
				: params.policyProfile.system.afterStartRefundPercent;
		return {
			policyCode: "system_default_refund" as const,
			policyLabel: "System cancellation policy",
			refundPercent: clampPercent(refundPercent),
		};
	}

	if (
		params.hoursUntilStart >=
		params.policyProfile.customer.fullRefundHoursBeforeStart
	) {
		return {
			policyCode: "customer_early_full_refund" as const,
			policyLabel: "Customer early cancellation",
			refundPercent: 100,
		};
	}

	if (
		params.hoursUntilStart >=
		params.policyProfile.customer.partialRefundHoursBeforeStart
	) {
		return {
			policyCode: "customer_standard_partial_refund" as const,
			policyLabel: "Customer standard cancellation",
			refundPercent: clampPercent(
				params.policyProfile.customer.partialRefundPercent
			),
		};
	}

	return {
		policyCode: "customer_late_refund" as const,
		policyLabel: "Customer late cancellation",
		refundPercent: clampPercent(
			params.policyProfile.customer.lateRefundPercent
		),
	};
};

const resolveReasonConfig = (params: {
	actor: BookingCancellationActor;
	reasonCode?: BookingCancellationReasonCode;
	evidence?: BookingCancellationEvidence[];
}) => {
	if (!params.reasonCode) {
		return null;
	}

	const reasonConfig = bookingCancellationReasonCatalog[params.reasonCode];
	if (!reasonConfig.allowedActors.includes(params.actor)) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Cancellation reason ${params.reasonCode} is not allowed for actor ${params.actor}`,
		});
	}

	if (reasonConfig.requiresEvidence && (params.evidence?.length ?? 0) === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Cancellation reason ${params.reasonCode} requires evidence`,
		});
	}

	return reasonConfig;
};

export const assertCancellationPolicyReasonInput = (params: {
	actor: BookingCancellationActor;
	reasonCode?: BookingCancellationReasonCode;
	evidence?: BookingCancellationEvidence[];
}) => {
	resolveReasonConfig(params);
};

const roundDownPercent = (amountCents: number, percent: number) =>
	Math.floor((amountCents * percent) / 100);

const deriveCancellationPaymentStatus = (params: {
	capturedAmountCents: number;
	nextRefundAmountCents: number;
}) => {
	const remainingCapturedCents = Math.max(
		params.capturedAmountCents - params.nextRefundAmountCents,
		0
	);
	if (params.capturedAmountCents <= 0) {
		return "unpaid" as const;
	}
	if (remainingCapturedCents <= 0) {
		return "refunded" as const;
	}
	if (remainingCapturedCents < params.capturedAmountCents) {
		return "partially_paid" as const;
	}
	return "paid" as const;
};

const computeCancellationPolicyOutcome = (params: {
	bookingRecord: typeof booking.$inferSelect;
	actor: BookingCancellationActor;
	now: Date;
	capturedAmountCents: number;
	alreadyRefundedCents: number;
	policyProfile: BookingCancellationPolicyProfile;
	reasonCode?: BookingCancellationReasonCode;
	evidence?: BookingCancellationEvidence[];
}) => {
	const hoursUntilStart =
		(params.bookingRecord.startsAt.getTime() - params.now.getTime()) /
		MS_PER_HOUR;
	const refundableBaseCents = Math.max(
		params.capturedAmountCents - params.alreadyRefundedCents,
		0
	);
	const defaultPolicy = resolveDefaultPolicyByActor({
		actor: params.actor,
		hoursUntilStart,
		now: params.now,
		bookingStartsAt: params.bookingRecord.startsAt,
		policyProfile: params.policyProfile,
	});
	const reasonConfig = resolveReasonConfig({
		actor: params.actor,
		reasonCode: params.reasonCode,
		evidence: params.evidence,
	});
	const reasonOverridePercent =
		reasonConfig?.refundPercentOverrideByActor?.[params.actor];
	const refundPercent = clampPercent(
		reasonOverridePercent ?? defaultPolicy.refundPercent
	);
	const suggestedRefundCents = Math.min(
		refundableBaseCents,
		roundDownPercent(refundableBaseCents, refundPercent)
	);

	return {
		actor: params.actor,
		policyCode:
			reasonOverridePercent === undefined
				? defaultPolicy.policyCode
				: "reason_override_refund",
		policyLabel: reasonConfig?.label ?? defaultPolicy.policyLabel,
		policySource:
			reasonOverridePercent === undefined
				? "default_profile"
				: "reason_override",
		reasonCode: params.reasonCode,
		reasonLabel: reasonConfig?.label,
		evidenceCount: params.evidence?.length ?? 0,
		refundPercent,
		hoursUntilStart: Number(hoursUntilStart.toFixed(2)),
		capturedAmountCents: params.capturedAmountCents,
		alreadyRefundedCents: params.alreadyRefundedCents,
		refundableBaseCents,
		suggestedRefundCents,
	} satisfies CancellationPolicyOutcome;
};

const fetchCapturedAmountCents = async (tx: typeof db, bookingId: string) => {
	const [capturedAmountRow] = await tx
		.select({
			capturedAmountCents: sql<number>`coalesce(sum(case when ${bookingPaymentAttempt.status} = 'captured' then ${bookingPaymentAttempt.amountCents} else 0 end), 0)`,
		})
		.from(bookingPaymentAttempt)
		.where(eq(bookingPaymentAttempt.bookingId, bookingId));

	return Number(capturedAmountRow?.capturedAmountCents ?? 0);
};

const fetchProcessedRefundSumCents = async (
	tx: typeof db,
	bookingId: string
) => {
	const [refundSumRow] = await tx
		.select({
			totalRefundedCents: sql<number>`coalesce(sum(case when ${bookingRefund.status} = 'processed' then ${bookingRefund.amountCents} else 0 end), 0)`,
		})
		.from(bookingRefund)
		.where(eq(bookingRefund.bookingId, bookingId));

	return Number(refundSumRow?.totalRefundedCents ?? 0);
};

export const applyCancellationPolicyAndRefund = async (params: {
	bookingId: string;
	actor: BookingCancellationActor;
	actedByUserId?: string | null;
	reason?: string;
	reasonCode?: BookingCancellationReasonCode;
	evidence?: BookingCancellationEvidence[];
	now?: Date;
}): Promise<AppliedCancellationPolicyResult> => {
	const now = params.now ?? new Date();
	const [managedBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, params.bookingId))
		.limit(1);
	if (!managedBooking) {
		throw new ORPCError("NOT_FOUND");
	}

	const [organizationRow] = await db
		.select({
			metadata: organization.metadata,
		})
		.from(organization)
		.where(eq(organization.id, managedBooking.organizationId))
		.limit(1);
	const policyProfile = resolvePolicyProfile(organizationRow?.metadata);

	const capturedAmountCents = await fetchCapturedAmountCents(
		db,
		managedBooking.id
	);
	const alreadyRefundedCents = await fetchProcessedRefundSumCents(
		db,
		managedBooking.id
	);
	const outcome = computeCancellationPolicyOutcome({
		bookingRecord: managedBooking,
		actor: params.actor,
		now,
		capturedAmountCents,
		alreadyRefundedCents,
		policyProfile,
		reasonCode: params.reasonCode,
		evidence: params.evidence,
	});

	const externalRefundId = toPolicyExternalRefundId(managedBooking.id);
	const [existingPolicyRefund] = await db
		.select()
		.from(bookingRefund)
		.where(
			and(
				eq(bookingRefund.provider, AUTO_POLICY_REFUND_PROVIDER),
				eq(bookingRefund.externalRefundId, externalRefundId)
			)
		)
		.limit(1);

	let refund: AppliedCancellationRefund | null = null;
	if (existingPolicyRefund?.status === "processed") {
		refund = {
			refundId: existingPolicyRefund.id,
			amountCents: existingPolicyRefund.amountCents,
		};
	} else if (outcome.suggestedRefundCents > 0) {
		const refundId = crypto.randomUUID();
		try {
			await db.insert(bookingRefund).values({
				id: refundId,
				bookingId: managedBooking.id,
				organizationId: managedBooking.organizationId,
				requestedByUserId: params.actedByUserId ?? null,
				approvedByUserId: params.actedByUserId ?? null,
				processedByUserId: params.actedByUserId ?? null,
				status: "processed",
				amountCents: outcome.suggestedRefundCents,
				currency: managedBooking.currency,
				reason:
					params.reason ??
					`Cancellation policy: ${outcome.policyCode} (${params.actor})`,
				provider: AUTO_POLICY_REFUND_PROVIDER,
				externalRefundId,
				metadata: JSON.stringify({
					policyCode: outcome.policyCode,
					policyLabel: outcome.policyLabel,
					policySource: outcome.policySource,
					actor: params.actor,
					reasonCode: params.reasonCode,
					reasonLabel: outcome.reasonLabel,
					evidenceCount: outcome.evidenceCount,
					refundPercent: outcome.refundPercent,
					capturedAmountCents: outcome.capturedAmountCents,
					refundableBaseCents: outcome.refundableBaseCents,
					alreadyRefundedCents: outcome.alreadyRefundedCents,
					evidence: params.evidence ?? [],
				}),
				requestedAt: now,
				approvedAt: now,
				processedAt: now,
				createdAt: now,
				updatedAt: now,
			});
			refund = {
				refundId,
				amountCents: outcome.suggestedRefundCents,
			};
		} catch (error) {
			if (!isUniqueConstraintError(error)) {
				throw error;
			}

			const [storedPolicyRefund] = await db
				.select()
				.from(bookingRefund)
				.where(
					and(
						eq(bookingRefund.provider, AUTO_POLICY_REFUND_PROVIDER),
						eq(bookingRefund.externalRefundId, externalRefundId)
					)
				)
				.limit(1);
			if (!storedPolicyRefund) {
				throw error;
			}
			refund =
				storedPolicyRefund.status === "processed"
					? {
							refundId: storedPolicyRefund.id,
							amountCents: storedPolicyRefund.amountCents,
						}
					: null;
		}
	}

	const nextRefundAmountCents = await fetchProcessedRefundSumCents(
		db,
		managedBooking.id
	);
	await db
		.update(booking)
		.set({
			refundAmountCents: nextRefundAmountCents,
			paymentStatus: deriveCancellationPaymentStatus({
				capturedAmountCents: outcome.capturedAmountCents,
				nextRefundAmountCents,
			}),
			updatedAt: now,
		})
		.where(eq(booking.id, managedBooking.id));

	return {
		outcome,
		refund,
	};
};
