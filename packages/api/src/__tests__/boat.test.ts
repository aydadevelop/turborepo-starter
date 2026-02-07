import { describe, expect, it } from "vitest";

import {
	createBoatAvailabilityBlockInputSchema,
	createBoatPricingProfileInputSchema,
	createManagedBoatInputSchema,
	isValidBoatSlug,
	normalizeBoatSlug,
	replaceBoatAvailabilityRulesInputSchema,
	updateManagedBoatInputSchema,
} from "../routers/boat.schemas";

describe("boat router schemas", () => {
	it("normalizes slugs from human names", () => {
		const slug = normalizeBoatSlug("  My Fast Boat 2026!!!  ");

		expect(slug).toBe("my-fast-boat-2026");
		expect(isValidBoatSlug(slug)).toBe(true);
	});

	it("rejects invalid create payload", () => {
		const result = createManagedBoatInputSchema.safeParse({
			name: "A",
			passengerCapacity: 0,
		});

		expect(result.success).toBe(false);
	});

	it("accepts valid create payload with defaults", () => {
		const result = createManagedBoatInputSchema.safeParse({
			name: "Sea Explorer",
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected schema validation to succeed");
		}
		expect(result.data.type).toBe("other");
		expect(result.data.passengerCapacity).toBe(1);
		expect(result.data.minimumHours).toBe(1);
	});

	it("validates working hours on update", () => {
		const result = updateManagedBoatInputSchema.safeParse({
			boatId: "boat-1",
			workingHoursStart: 20,
			workingHoursEnd: 10,
		});

		expect(result.success).toBe(false);
	});

	it("validates availability blocks range", () => {
		const result = createBoatAvailabilityBlockInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-02-10T12:00:00.000Z",
			endsAt: "2026-02-10T10:00:00.000Z",
		});

		expect(result.success).toBe(false);
	});

	it("validates availability rules", () => {
		const result = replaceBoatAvailabilityRulesInputSchema.safeParse({
			boatId: "boat-1",
			rules: [
				{
					dayOfWeek: 1,
					startMinute: 600,
					endMinute: 1200,
					isActive: true,
				},
			],
		});

		expect(result.success).toBe(true);
	});

	it("normalizes currency input in pricing profile schema", () => {
		const result = createBoatPricingProfileInputSchema.safeParse({
			boatId: "boat-1",
			name: "Base",
			currency: "rub",
			baseHourlyPriceCents: 150_000,
		});

		expect(result.success).toBe(true);
	});
});
