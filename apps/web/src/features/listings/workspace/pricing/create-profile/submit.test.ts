import { describe, expect, it } from "vitest";

import { buildCreatePricingProfileInput } from "./submit";

describe("buildCreatePricingProfileInput", () => {
	it("maps form values into the oRPC input shape", () => {
		expect(
			buildCreatePricingProfileInput("listing-1", {
				name: "Weekend",
				currency: "rub",
				baseHourlyPriceCents: "120000",
				minimumHours: "2",
				serviceFeeBps: "500",
				taxBps: "2000",
				isDefault: true,
			})
		).toEqual({
			ok: true,
			data: {
				listingId: "listing-1",
				name: "Weekend",
				currency: "RUB",
				baseHourlyPriceCents: 120_000,
				minimumHours: 2,
				serviceFeeBps: 500,
				taxBps: 2000,
				isDefault: true,
			},
		});
	});

	it("rejects invalid numeric values", () => {
		expect(
			buildCreatePricingProfileInput("listing-1", {
				name: "Weekend",
				currency: "RUB",
				baseHourlyPriceCents: "0",
				minimumHours: "2",
				serviceFeeBps: "500",
				taxBps: "2000",
				isDefault: false,
			})
		).toEqual({
			ok: false,
			message: "Base hourly price must be a positive whole number.",
		});
	});
});
