import { describe, expect, it } from "vitest";

import { buildCreatePricingRuleInput } from "./submit";

describe("buildCreatePricingRuleInput", () => {
	it("maps pricing rule form values into the oRPC input shape", () => {
		expect(
			buildCreatePricingRuleInput("listing-1", {
				pricingProfileId: "profile-1",
				name: "Weekend uplift",
				ruleType: "dayOfWeek",
				conditionJsonText: '{"alwaysApply":true}',
				adjustmentType: "percent",
				adjustmentValue: "20",
				priority: "10",
			})
		).toEqual({
			ok: true,
			data: {
				listingId: "listing-1",
				pricingProfileId: "profile-1",
				name: "Weekend uplift",
				ruleType: "dayOfWeek",
				conditionJson: { alwaysApply: true },
				adjustmentType: "percent",
				adjustmentValue: 20,
				priority: 10,
			},
		});
	});

	it("rejects non-object condition JSON", () => {
		expect(
			buildCreatePricingRuleInput("listing-1", {
				pricingProfileId: "profile-1",
				name: "Weekend uplift",
				ruleType: "dayOfWeek",
				conditionJsonText: "[]",
				adjustmentType: "percent",
				adjustmentValue: "20",
				priority: "10",
			})
		).toEqual({
			ok: false,
			message: "Condition JSON must be a JSON object.",
		});
	});
});
