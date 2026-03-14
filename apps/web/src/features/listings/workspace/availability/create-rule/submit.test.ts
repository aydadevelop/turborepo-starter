import { describe, expect, it } from "vitest";

import { buildCreateAvailabilityRuleInput } from "./submit";

describe("buildCreateAvailabilityRuleInput", () => {
	it("maps form values into the oRPC input shape", () => {
		expect(
			buildCreateAvailabilityRuleInput("listing-1", {
				dayOfWeek: "5",
				startTime: "10:30",
				endTime: "18:00",
			}),
		).toEqual({
			ok: true,
			data: {
				listingId: "listing-1",
				dayOfWeek: 5,
				startMinute: 630,
				endMinute: 1080,
			},
		});
	});

	it("rejects inverted time windows", () => {
		expect(
			buildCreateAvailabilityRuleInput("listing-1", {
				dayOfWeek: "5",
				startTime: "18:00",
				endTime: "10:30",
			}),
		).toEqual({
			ok: false,
			message: "End time must be later than start time.",
		});
	});
});
