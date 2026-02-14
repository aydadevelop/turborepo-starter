import { describe, expect, it } from "vitest";

import type { BoatPricingProfile, BoatPricingRule } from "../booking/pricing";
import {
	applyBoatPricingRulesToSubtotalCents,
	buildBookingPricingQuote,
	estimateBookingHours,
	estimateBookingSubtotalCentsFromProfile,
} from "../booking/pricing";

const makeProfile = (
	overrides: Partial<BoatPricingProfile> = {}
): BoatPricingProfile => {
	const now = new Date("2026-02-10T00:00:00.000Z");
	return {
		id: "profile-1",
		boatId: "boat-1",
		name: "Default",
		currency: "RUB",
		baseHourlyPriceCents: 10_000,
		minimumHours: 1,
		depositPercentage: 0,
		serviceFeePercentage: 10,
		affiliateFeePercentage: 5,
		taxPercentage: 20,
		acquiringFeePercentage: 3,
		validFrom: now,
		validTo: null,
		isDefault: true,
		createdByUserId: null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
};

const makeRule = (
	overrides: Partial<BoatPricingRule> = {}
): BoatPricingRule => {
	const now = new Date("2026-02-10T00:00:00.000Z");
	return {
		id: "rule-1",
		boatId: "boat-1",
		pricingProfileId: null,
		name: "Rule",
		ruleType: "custom",
		conditionJson: "{}",
		adjustmentType: "fixed_cents",
		adjustmentValue: 0,
		priority: 0,
		isActive: true,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
};

describe("booking pricing quote math", () => {
	it("does not include acquiring/tax in customer total; pay-now defaults to platform fees", () => {
		const profile = makeProfile({
			depositPercentage: 0,
			serviceFeePercentage: 10,
			affiliateFeePercentage: 5,
			acquiringFeePercentage: 3,
			taxPercentage: 20,
		});
		const quote = buildBookingPricingQuote({
			profile,
			estimatedHours: 2,
			subtotalCents: 20_000,
		});

		expect(quote.estimatedServiceFeeCents).toBe(2000);
		expect(quote.estimatedAffiliateFeeCents).toBe(1000);
		// Platform fees are what the customer pays online by default.
		expect(quote.estimatedPayNowCents).toBe(3000);
		expect(quote.estimatedPayLaterCents).toBe(20_000);

		// Acquiring + tax are computed on platform fees, but not added to customer total.
		expect(quote.estimatedAcquiringFeeCents).toBe(90);
		expect(quote.estimatedTaxCents).toBe(600);
		expect(quote.estimatedTotalPriceCents).toBe(23_000);
	});

	it("keeps pay-now as platform markup even when deposit percentage is configured", () => {
		const profile = makeProfile({
			depositPercentage: 20,
		});
		const quote = buildBookingPricingQuote({
			profile,
			estimatedHours: 2,
			subtotalCents: 20_000,
		});

		// Fees: 10% + 5% of 20k = 3k.
		expect(quote.estimatedPayNowCents).toBe(3000);
		expect(quote.estimatedPayLaterCents).toBe(20_000);
		expect(quote.estimatedTotalPriceCents).toBe(23_000);
	});

	it("computes pay-now from discounted base (final minus owner base)", () => {
		const profile = makeProfile({
			serviceFeePercentage: 10,
			affiliateFeePercentage: 5,
			depositPercentage: 0,
		});
		const discountedSubtotalCents = 4500; // e.g. 5_000 with 10% discount
		const quote = buildBookingPricingQuote({
			profile,
			estimatedHours: 1,
			subtotalCents: discountedSubtotalCents,
		});

		// markup = 15% of 4500 = 675
		expect(quote.estimatedTotalPriceCents).toBe(5175);
		expect(quote.estimatedPayNowCents).toBe(675);
		expect(quote.estimatedPayLaterCents).toBe(4500);
	});
});

describe("booking pricing rules", () => {
	it("applies duration discount based on billed hours (ceil)", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 10_000,
		});
		const rules: BoatPricingRule[] = [
			makeRule({
				id: "rule-duration-10off",
				ruleType: "duration_discount",
				conditionJson: JSON.stringify({ minHours: 4 }),
				adjustmentType: "percentage",
				adjustmentValue: -10,
				priority: 10,
			}),
		];

		const result = estimateBookingSubtotalCentsFromProfile({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T15:00:00.000Z"),
			boatMinimumHours: 1,
			passengers: 2,
			timeZone: "UTC",
			profile,
			pricingRules: rules,
		});

		expect(result.estimatedHours).toBe(5);
		// 5 * 10_000 = 50_000, -10% => 45_000
		expect(result.subtotalCents).toBe(45_000);
	});

	it("applies passenger surcharge per extra passenger for fixed adjustments", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 10_000,
		});
		const rules: BoatPricingRule[] = [
			makeRule({
				id: "rule-passenger",
				ruleType: "passenger_surcharge",
				conditionJson: JSON.stringify({ includedPassengers: 2 }),
				adjustmentType: "fixed_cents",
				adjustmentValue: 500,
			}),
		];

		const result = estimateBookingSubtotalCentsFromProfile({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T11:00:00.000Z"),
			boatMinimumHours: 1,
			passengers: 4,
			timeZone: "UTC",
			profile,
			pricingRules: rules,
		});

		// base 10_000 + (2 extra * 500) = 11_000
		expect(result.subtotalCents).toBe(11_000);
	});

	it("supports cross-midnight time windows for night pricing", () => {
		const rules: BoatPricingRule[] = [
			makeRule({
				id: "rule-night",
				ruleType: "time_window",
				conditionJson: JSON.stringify({ startHour: 20, endHour: 4 }),
				adjustmentType: "percentage",
				adjustmentValue: 20,
			}),
		];

		const subtotal = applyBoatPricingRulesToSubtotalCents({
			subtotalCents: 10_000,
			estimatedHours: 1,
			passengers: 1,
			startsAt: new Date("2026-03-07T22:00:00.000Z"),
			endsAt: new Date("2026-03-07T23:00:00.000Z"),
			timeZone: "UTC",
			pricingRules: rules,
		});

		// +20% => +2_000
		expect(subtotal).toBe(12_000);
	});

	it("applies time_window rule proportionally to intersected slot duration", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 10_000,
		});
		const rules: BoatPricingRule[] = [
			makeRule({
				id: "rule-prime-time",
				ruleType: "time_window",
				conditionJson: JSON.stringify({
					startHour: 20,
					startMinute: 0,
					endHour: 22,
					endMinute: 0,
				}),
				adjustmentType: "percentage",
				adjustmentValue: 20,
			}),
		];

		const result = estimateBookingSubtotalCentsFromProfile({
			startsAt: new Date("2026-03-07T19:00:00.000Z"),
			endsAt: new Date("2026-03-07T21:00:00.000Z"),
			boatMinimumHours: 1,
			passengers: 2,
			timeZone: "UTC",
			profile,
			pricingRules: rules,
		});

		// Base: 2h * 10_000 = 20_000
		// Rule intersects only 1h of 2h slot -> +10% effective = +2_000
		expect(result.subtotalCents).toBe(22_000);
	});

	it("ignores invalid time_window minute boundaries in runtime evaluation", () => {
		const rules: BoatPricingRule[] = [
			makeRule({
				id: "rule-invalid-minutes",
				ruleType: "time_window",
				conditionJson: JSON.stringify({
					startHour: 20,
					startMinute: 15,
					endHour: 22,
					endMinute: 45,
				}),
				adjustmentType: "percentage",
				adjustmentValue: 20,
			}),
		];

		const subtotal = applyBoatPricingRulesToSubtotalCents({
			subtotalCents: 10_000,
			estimatedHours: 1,
			passengers: 1,
			startsAt: new Date("2026-03-07T20:00:00.000Z"),
			endsAt: new Date("2026-03-07T21:00:00.000Z"),
			timeZone: "UTC",
			pricingRules: rules,
		});

		expect(subtotal).toBe(10_000);
	});
});

describe("sub-hour pricing (half-hour granularity)", () => {
	it("bills 0.5h for a 30-min slot when boat minimum is 0", () => {
		const hours = estimateBookingHours({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T10:30:00.000Z"),
			boatMinimumHours: 0,
			profileMinimumHours: 0,
		});
		expect(hours).toBe(0.5);
	});

	it("bills 1h for a 30-min slot when boat minimum is 1 (default)", () => {
		const hours = estimateBookingHours({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T10:30:00.000Z"),
			boatMinimumHours: 1,
			profileMinimumHours: 1,
		});
		expect(hours).toBe(1);
	});

	it("bills 2h for a 30-min slot when boat minimum is 2 (big boat)", () => {
		const hours = estimateBookingHours({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T10:30:00.000Z"),
			boatMinimumHours: 2,
			profileMinimumHours: 1,
		});
		expect(hours).toBe(2);
	});

	it("rounds 45 minutes up to 1h", () => {
		const hours = estimateBookingHours({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T10:45:00.000Z"),
			boatMinimumHours: 0,
			profileMinimumHours: 0,
		});
		expect(hours).toBe(1);
	});

	it("computes correct subtotal for 30-min slot with no minimum", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 10_000,
			minimumHours: 0,
		});
		const result = estimateBookingSubtotalCentsFromProfile({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T10:30:00.000Z"),
			boatMinimumHours: 0,
			passengers: 1,
			timeZone: "UTC",
			profile,
		});
		expect(result.estimatedHours).toBe(0.5);
		expect(result.subtotalCents).toBe(5000);
	});

	it("applies boat minimum over profile minimum", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 10_000,
			minimumHours: 0,
		});
		const result = estimateBookingSubtotalCentsFromProfile({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T10:30:00.000Z"),
			boatMinimumHours: 2,
			passengers: 1,
			timeZone: "UTC",
			profile,
		});
		expect(result.estimatedHours).toBe(2);
		expect(result.subtotalCents).toBe(20_000);
	});

	it("keeps exact hours for whole-hour slots unchanged", () => {
		const hours = estimateBookingHours({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T13:00:00.000Z"),
			boatMinimumHours: 1,
			profileMinimumHours: 1,
		});
		expect(hours).toBe(3);
	});

	it("rounds 1.5h slot correctly", () => {
		const hours = estimateBookingHours({
			startsAt: new Date("2026-03-07T10:00:00.000Z"),
			endsAt: new Date("2026-03-07T11:30:00.000Z"),
			boatMinimumHours: 0,
			profileMinimumHours: 0,
		});
		expect(hours).toBe(1.5);
	});
});
