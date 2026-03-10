import { describe, expect, it } from "vitest";
import {
	evaluateCancellationPolicy,
} from "../cancellation-policy-service";
import {
	FLEXIBLE_CANCELLATION_POLICY,
	STRICT_CANCELLATION_POLICY,
} from "../policy-templates";

const makeInput = (overrides: Partial<Parameters<typeof evaluateCancellationPolicy>[0]> = {}) => {
	const now = new Date("2024-06-01T12:00:00Z");
	return {
		bookingId: "booking-1",
		organizationId: "org-1",
		startsAt: new Date("2024-06-03T12:00:00Z"), // 48h from now
		endsAt: new Date("2024-06-04T12:00:00Z"),
		capturedAmountCents: 10_000,
		alreadyRefundedCents: 0,
		initiatorRole: "customer" as const,
		now,
		...overrides,
	};
};

describe("evaluateCancellationPolicy", () => {
	it("customer cancelling 48h before start with flexible policy gets 100% refund", () => {
		const input = makeInput({ policyProfile: FLEXIBLE_CANCELLATION_POLICY });
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundPercent).toBe(100);
		expect(decision.suggestedRefundCents).toBe(10_000);
		expect(decision.policyCode).toBe("customer_early_full_refund");
		expect(decision.policySource).toBe("default_profile");
	});

	it("customer cancelling 12h before start with strict policy gets 0% refund", () => {
		const now = new Date("2024-06-03T00:00:00Z");
		const startsAt = new Date("2024-06-03T12:00:00Z"); // 12h from now
		const input = makeInput({
			policyProfile: STRICT_CANCELLATION_POLICY,
			startsAt,
			now,
		});
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundPercent).toBe(0);
		expect(decision.suggestedRefundCents).toBe(0);
		expect(decision.policyCode).toBe("customer_late_refund");
	});

	it("owner cancellation always gets 100% refund regardless of timing", () => {
		const now = new Date("2024-06-03T11:00:00Z"); // 1h before start
		const startsAt = new Date("2024-06-03T12:00:00Z");
		const input = makeInput({
			initiatorRole: "owner",
			startsAt,
			now,
		});
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundPercent).toBe(100);
		expect(decision.suggestedRefundCents).toBe(10_000);
		expect(decision.policyCode).toBe("owner_default_refund");
	});

	it("reason override takes precedence over default timing policy", () => {
		const now = new Date("2024-06-03T11:00:00Z"); // 1h before start
		const startsAt = new Date("2024-06-03T12:00:00Z");
		const input = makeInput({
			initiatorRole: "customer",
			reasonCode: "CUSTOMER_HEALTH_ISSUE",
			startsAt,
			now,
		});
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundPercent).toBe(100);
		expect(decision.policySource).toBe("reason_override");
		expect(decision.policyCode).toBe("reason_override_refund");
	});

	it("already-refunded amount is subtracted from refundable base", () => {
		const input = makeInput({
			capturedAmountCents: 10_000,
			alreadyRefundedCents: 4_000,
			policyProfile: FLEXIBLE_CANCELLATION_POLICY,
		});
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundableBaseCents).toBe(6_000);
		expect(decision.suggestedRefundCents).toBe(6_000);
	});

	it("suggestedRefundCents never exceeds refundable base", () => {
		const input = makeInput({
			capturedAmountCents: 5_000,
			alreadyRefundedCents: 5_000,
			policyProfile: FLEXIBLE_CANCELLATION_POLICY,
		});
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundableBaseCents).toBe(0);
		expect(decision.suggestedRefundCents).toBe(0);
	});

	it("system before-start cancellation gets 100% by default", () => {
		const input = makeInput({ initiatorRole: "system" });
		const decision = evaluateCancellationPolicy(input);

		expect(decision.refundPercent).toBe(100);
		expect(decision.policyCode).toBe("system_default_refund");
	});

	it("throws when reason code is not allowed for actor", () => {
		const input = makeInput({
			initiatorRole: "customer",
			reasonCode: "OWNER_OPERATIONAL_ISSUE",
		});

		expect(() => evaluateCancellationPolicy(input)).toThrow(
			"CANCELLATION_REASON_NOT_ALLOWED",
		);
	});
});
