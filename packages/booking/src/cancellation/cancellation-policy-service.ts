import {
	type BookingCancellationEvidence,
	type BookingCancellationPolicyProfile,
	type BookingCancellationReasonCode,
	bookingCancellationReasonCatalog,
	defaultBookingCancellationPolicyProfile,
} from "./policy-templates";

export type {
	BookingCancellationEvidence,
	BookingCancellationPolicyProfile,
} from "./policy-templates";

const MS_PER_HOUR = 60 * 60 * 1000;

type CancellationPolicyCode =
	| "customer_early_full_refund"
	| "customer_standard_partial_refund"
	| "customer_late_refund"
	| "owner_default_refund"
	| "system_default_refund"
	| "reason_override_refund";

type CancellationPolicySource = "default_profile" | "reason_override";

export interface CancellationPolicyInput {
	alreadyRefundedCents: number;
	bookingId: string;
	capturedAmountCents: number;
	endsAt: Date;
	evidence?: BookingCancellationEvidence[];
	/** The actor initiating the cancellation. */
	initiatorRole: "customer" | "owner" | "system";
	/** Defaults to `new Date()` if not provided. */
	now?: Date;
	organizationId: string;
	/**
	 * Optional policy profile override. When omitted, the default profile is used.
	 * Callers should load the organization's profile and pass it here.
	 */
	policyProfile?: BookingCancellationPolicyProfile;
	reasonCode?: BookingCancellationReasonCode;
	startsAt: Date;
}

export interface CancellationPolicyDecision {
	actor: "customer" | "owner" | "system";
	alreadyRefundedCents: number;
	bookingId: string;
	capturedAmountCents: number;
	hoursUntilStart: number;
	policyCode: CancellationPolicyCode;
	policyLabel: string;
	policySource: CancellationPolicySource;
	reasonCode?: BookingCancellationReasonCode;
	reasonLabel?: string;
	refundableBaseCents: number;
	refundPercent: number;
	suggestedRefundCents: number;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100);

const roundDownPercent = (amountCents: number, percent: number) =>
	Math.floor((amountCents * percent) / 100);

const resolveDefaultPolicyByActor = (params: {
	actor: "customer" | "owner" | "system";
	hoursUntilStart: number;
	now: Date;
	bookingStartsAt: Date;
	policyProfile: BookingCancellationPolicyProfile;
}): {
	policyCode: CancellationPolicyCode;
	policyLabel: string;
	refundPercent: number;
} => {
	if (params.actor === "owner") {
		return {
			policyCode: "owner_default_refund",
			policyLabel: "Owner cancellation policy",
			refundPercent: clampPercent(
				params.policyProfile.owner.defaultRefundPercent,
			),
		};
	}

	if (params.actor === "system") {
		const refundPercent =
			params.now < params.bookingStartsAt
				? params.policyProfile.system.beforeStartRefundPercent
				: params.policyProfile.system.afterStartRefundPercent;
		return {
			policyCode: "system_default_refund",
			policyLabel: "System cancellation policy",
			refundPercent: clampPercent(refundPercent),
		};
	}

	// customer
	if (
		params.hoursUntilStart >=
		params.policyProfile.customer.fullRefundHoursBeforeStart
	) {
		return {
			policyCode: "customer_early_full_refund",
			policyLabel: "Customer early cancellation",
			refundPercent: 100,
		};
	}

	if (
		params.hoursUntilStart >=
		params.policyProfile.customer.partialRefundHoursBeforeStart
	) {
		return {
			policyCode: "customer_standard_partial_refund",
			policyLabel: "Customer standard cancellation",
			refundPercent: clampPercent(
				params.policyProfile.customer.partialRefundPercent,
			),
		};
	}

	return {
		policyCode: "customer_late_refund",
		policyLabel: "Customer late cancellation",
		refundPercent: clampPercent(
			params.policyProfile.customer.lateRefundPercent,
		),
	};
};

const resolveReasonConfig = (params: {
	actor: "customer" | "owner" | "system";
	reasonCode?: BookingCancellationReasonCode;
	evidence?: BookingCancellationEvidence[];
}) => {
	if (!params.reasonCode) {
		return null;
	}

	const reasonConfig = bookingCancellationReasonCatalog[params.reasonCode];
	if (!reasonConfig.allowedActors.includes(params.actor)) {
		throw new Error(
			`CANCELLATION_REASON_NOT_ALLOWED: reason ${params.reasonCode} is not allowed for actor ${params.actor}`,
		);
	}

	if (reasonConfig.requiresEvidence && (params.evidence?.length ?? 0) === 0) {
		throw new Error(
			`CANCELLATION_REASON_REQUIRES_EVIDENCE: reason ${params.reasonCode} requires evidence`,
		);
	}

	return reasonConfig;
};

/**
 * Pure policy evaluation — no DB or HTTP calls.
 *
 * The caller is responsible for fetching captured/refunded amounts and
 * constructing the correct policy profile before calling this function.
 */
export function evaluateCancellationPolicy(
	input: CancellationPolicyInput,
): CancellationPolicyDecision {
	const now = input.now ?? new Date();
	const policyProfile =
		input.policyProfile ?? defaultBookingCancellationPolicyProfile;

	const hoursUntilStart =
		(input.startsAt.getTime() - now.getTime()) / MS_PER_HOUR;
	const refundableBaseCents = Math.max(
		input.capturedAmountCents - input.alreadyRefundedCents,
		0,
	);

	const defaultPolicy = resolveDefaultPolicyByActor({
		actor: input.initiatorRole,
		hoursUntilStart,
		now,
		bookingStartsAt: input.startsAt,
		policyProfile,
	});

	const reasonConfig = resolveReasonConfig({
		actor: input.initiatorRole,
		reasonCode: input.reasonCode,
		evidence: input.evidence,
	});

	const reasonOverridePercent =
		reasonConfig?.refundPercentOverrideByActor?.[input.initiatorRole];
	const refundPercent = clampPercent(
		reasonOverridePercent ?? defaultPolicy.refundPercent,
	);
	const suggestedRefundCents = Math.min(
		refundableBaseCents,
		roundDownPercent(refundableBaseCents, refundPercent),
	);

	return {
		bookingId: input.bookingId,
		actor: input.initiatorRole,
		policyCode:
			reasonOverridePercent === undefined
				? defaultPolicy.policyCode
				: "reason_override_refund",
		policyLabel: reasonConfig?.label ?? defaultPolicy.policyLabel,
		policySource:
			reasonOverridePercent === undefined
				? "default_profile"
				: "reason_override",
		refundPercent,
		suggestedRefundCents,
		hoursUntilStart: Number(hoursUntilStart.toFixed(2)),
		capturedAmountCents: input.capturedAmountCents,
		alreadyRefundedCents: input.alreadyRefundedCents,
		refundableBaseCents,
		reasonCode: input.reasonCode,
		reasonLabel: reasonConfig?.label,
	};
}
