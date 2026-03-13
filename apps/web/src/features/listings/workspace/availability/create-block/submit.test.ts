import { describe, expect, it } from "vitest";

import { buildCreateAvailabilityBlockInput } from "./submit";

describe("buildCreateAvailabilityBlockInput", () => {
	it("maps availability block form values into the oRPC input shape", () => {
		expect(
			buildCreateAvailabilityBlockInput("listing-1", {
				startsAt: "2026-06-01T10:00",
				endsAt: "2026-06-01T18:00",
				reason: "Private charter",
			})
		).toEqual({
			ok: true,
			data: {
				listingId: "listing-1",
				startsAt: new Date("2026-06-01T10:00").toISOString(),
				endsAt: new Date("2026-06-01T18:00").toISOString(),
				reason: "Private charter",
			},
		});
	});
});
