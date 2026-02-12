import { organization } from "@full-stack-cf-app/db/schema/auth";
import {
	boat,
	boatAmenity,
	boatPricingProfile,
	boatPricingRule,
} from "@full-stack-cf-app/db/schema/boat";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { Context } from "../context";

const testDbState = createTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { bookingRouter } = await import("../routers/booking");

const publicContext: Context = {
	session: null,
	activeMembership: null,
	requestUrl: "http://localhost:3000/rpc/booking/availabilityPublic",
	requestHostname: "localhost",
};

const startsAt = new Date("2026-03-10T10:00:00.000Z");
const endsAt = new Date("2026-03-10T12:00:00.000Z");

describe("booking availabilityPublic (integration)", () => {
	beforeAll(() => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);
	});

	afterAll(() => {
		testDbState.close();
	});

	beforeEach(() => {
		clearTestDatabase(testDbState.db);
	});

	it("filters boats by required amenity keys (must have all)", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values([
			{
				id: "boat-1",
				organizationId: "org-1",
				name: "Boat A",
				slug: "boat-a",
				status: "active",
				passengerCapacity: 10,
				minimumHours: 1,
				timezone: "UTC",
			},
			{
				id: "boat-2",
				organizationId: "org-1",
				name: "Boat B",
				slug: "boat-b",
				status: "active",
				passengerCapacity: 10,
				minimumHours: 1,
				timezone: "UTC",
			},
		]);

		await testDbState.db.insert(boatPricingProfile).values([
			{
				id: "profile-1",
				boatId: "boat-1",
				name: "Base",
				currency: "RUB",
				baseHourlyPriceCents: 10_000,
				isDefault: true,
				validFrom: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: "profile-2",
				boatId: "boat-2",
				name: "Base",
				currency: "RUB",
				baseHourlyPriceCents: 10_000,
				isDefault: true,
				validFrom: new Date("2026-01-01T00:00:00.000Z"),
			},
		]);

		await testDbState.db.insert(boatAmenity).values([
			{
				id: "amenity-1",
				boatId: "boat-1",
				key: "wifi",
				isEnabled: true,
			},
			{
				id: "amenity-2",
				boatId: "boat-1",
				key: "bbq",
				isEnabled: true,
			},
		]);

		const wifiOnly = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt,
				endsAt,
				passengers: 2,
				amenityKeys: ["wifi"],
			},
			{ context: publicContext }
		);

		expect(wifiOnly.items).toHaveLength(1);
		expect(wifiOnly.items[0]?.boat.id).toBe("boat-1");

		const mustHaveAll = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt,
				endsAt,
				passengers: 2,
				amenityKeys: ["wifi", "bbq"],
			},
			{ context: publicContext }
		);

		expect(mustHaveAll.items).toHaveLength(1);
		expect(mustHaveAll.items[0]?.boat.id).toBe("boat-1");

		const missingAmenity = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt,
				endsAt,
				passengers: 2,
				amenityKeys: ["wifi", "sauna"],
			},
			{ context: publicContext }
		);

		expect(missingAmenity.items).toHaveLength(0);
	});

	it("treats disabled amenities as absent", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-1",
			organizationId: "org-1",
			name: "Boat A",
			slug: "boat-a",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			timezone: "UTC",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-1",
			boatId: "boat-1",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		await testDbState.db.insert(boatAmenity).values({
			id: "amenity-1",
			boatId: "boat-1",
			key: "wifi",
			isEnabled: false,
		});

		const result = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt,
				endsAt,
				passengers: 2,
				amenityKeys: ["wifi"],
			},
			{ context: publicContext }
		);

		expect(result.items).toHaveLength(0);
	});

	it("excludes boats that have overlapping blocking bookings", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-1",
			organizationId: "org-1",
			name: "Boat A",
			slug: "boat-a",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			timezone: "UTC",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-1",
			boatId: "boat-1",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		await testDbState.db.insert(booking).values({
			id: "booking-1",
			organizationId: "org-1",
			boatId: "boat-1",
			source: "web",
			status: "confirmed",
			paymentStatus: "unpaid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-10T11:00:00.000Z"),
			endsAt: new Date("2026-03-10T13:00:00.000Z"),
			passengers: 2,
			timezone: "UTC",
			basePriceCents: 0,
			discountAmountCents: 0,
			totalPriceCents: 0,
			currency: "RUB",
		});

		const result = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt,
				endsAt,
				passengers: 2,
			},
			{ context: publicContext }
		);

		expect(result.items).toHaveLength(0);
	});

	it("withSlots excludes blocked day slots even when block is outside query window", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-1",
			organizationId: "org-1",
			name: "Boat A",
			slug: "boat-a",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			minimumNoticeMinutes: 0,
			workingHoursStart: 9,
			workingHoursEnd: 21,
			timezone: "UTC",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-1",
			boatId: "boat-1",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		// Busy interval later in the same day than the requested search range.
		await testDbState.db.insert(booking).values({
			id: "booking-later-day",
			organizationId: "org-1",
			boatId: "boat-1",
			source: "web",
			status: "confirmed",
			paymentStatus: "unpaid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-10T16:00:00.000Z"),
			endsAt: new Date("2026-03-10T18:00:00.000Z"),
			passengers: 2,
			timezone: "UTC",
			basePriceCents: 0,
			discountAmountCents: 0,
			totalPriceCents: 0,
			currency: "RUB",
		});

		const result = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt: new Date("2026-03-10T10:00:00.000Z"),
				endsAt: new Date("2026-03-10T12:00:00.000Z"),
				passengers: 2,
				withSlots: true,
			},
			{ context: publicContext }
		);

		expect(result.items).toHaveLength(1);
		const [boatItem] = result.items;
		expect(boatItem).toBeDefined();
		if (!boatItem?.slots) {
			throw new Error("Expected slots to be present when withSlots=true");
		}

		const slotStarts = boatItem.slots.map((slot) =>
			slot.startsAt.toISOString()
		);

		// Free slot ending right at busy interval start is still valid.
		expect(slotStarts).toContain("2026-03-10T14:00:00.000Z");

		// Slots overlapping 16:00-18:00 busy window must be removed.
		expect(slotStarts).not.toContain("2026-03-10T14:30:00.000Z");
		expect(slotStarts).not.toContain("2026-03-10T16:00:00.000Z");
		expect(slotStarts).not.toContain("2026-03-10T17:00:00.000Z");
	});

	it("withSlots resolves slot day using boat timezone, not UTC date slice", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-moscow",
			organizationId: "org-1",
			name: "Moscow Boat",
			slug: "moscow-boat",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			minimumNoticeMinutes: 0,
			workingHoursStart: 8,
			workingHoursEnd: 10,
			timezone: "Europe/Moscow",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-moscow",
			boatId: "boat-moscow",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		const result = await call(
			bookingRouter.availabilityPublic,
			{
				startsAt: new Date("2026-03-10T22:00:00.000Z"),
				endsAt: new Date("2026-03-10T23:00:00.000Z"),
				passengers: 2,
				withSlots: true,
			},
			{ context: publicContext }
		);

		expect(result.items).toHaveLength(1);
		const [boatItem] = result.items;
		expect(boatItem).toBeDefined();
		if (!boatItem?.slots) {
			throw new Error("Expected slots to be present when withSlots=true");
		}

		expect(boatItem.slots.length).toBeGreaterThan(0);
		expect(
			boatItem.slots[0]?.startsAt.toISOString().startsWith("2026-03-11")
		).toBe(true);
	});

	it("supports date+duration input mode for availabilityPublic", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-date-mode",
			organizationId: "org-1",
			name: "Date Mode Boat",
			slug: "date-mode-boat",
			status: "active",
			passengerCapacity: 8,
			minimumHours: 1,
			minimumNoticeMinutes: 0,
			workingHoursStart: 9,
			workingHoursEnd: 18,
			timezone: "UTC",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-date-mode",
			boatId: "boat-date-mode",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		const result = await call(
			bookingRouter.availabilityPublic,
			{
				date: "2026-03-10",
				durationHours: 2,
				passengers: 2,
				withSlots: true,
			},
			{ context: publicContext }
		);

		expect(result.items).toHaveLength(1);
		const [boatItem] = result.items;
		expect(boatItem).toBeDefined();
		if (!boatItem?.slots) {
			throw new Error("Expected slots to be present when withSlots=true");
		}

		expect(boatItem.slots.length).toBeGreaterThan(0);
		expect(boatItem.slots[0]?.startsAt.toISOString()).toBe(
			"2026-03-10T09:00:00.000Z"
		);
		expect(boatItem.pricingQuote.estimatedHours).toBe(2);
	});

	it("supports legacy availability band sort mode", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-03-10T09:00:00.000Z"));

			await testDbState.db.insert(organization).values({
				id: "org-1",
				name: "Org",
				slug: "org",
			});

			await testDbState.db.insert(boat).values([
				{
					id: "boat-evening-weighted",
					organizationId: "org-1",
					name: "Evening Boat",
					slug: "evening-boat",
					status: "active",
					passengerCapacity: 8,
					minimumHours: 1,
					minimumNoticeMinutes: 0,
					workingHoursStart: 16,
					workingHoursEnd: 20,
					timezone: "Europe/Moscow",
					createdAt: new Date("2026-03-01T10:00:00.000Z"),
				},
				{
					id: "boat-morning-weighted",
					organizationId: "org-1",
					name: "Morning Boat",
					slug: "morning-boat",
					status: "active",
					passengerCapacity: 8,
					minimumHours: 1,
					minimumNoticeMinutes: 0,
					workingHoursStart: 8,
					workingHoursEnd: 12,
					timezone: "Europe/Moscow",
					createdAt: new Date("2026-03-09T10:00:00.000Z"),
				},
			]);

			await testDbState.db.insert(boatPricingProfile).values([
				{
					id: "profile-evening-weighted",
					boatId: "boat-evening-weighted",
					name: "Base",
					currency: "RUB",
					baseHourlyPriceCents: 10_000,
					isDefault: true,
					validFrom: new Date("2026-01-01T00:00:00.000Z"),
				},
				{
					id: "profile-morning-weighted",
					boatId: "boat-morning-weighted",
					name: "Base",
					currency: "RUB",
					baseHourlyPriceCents: 10_000,
					isDefault: true,
					validFrom: new Date("2026-01-01T00:00:00.000Z"),
				},
			]);

			const result = await call(
				bookingRouter.availabilityPublic,
				{
					date: "2026-03-12",
					durationHours: 1,
					passengers: 2,
					sortBy: "availability_bands",
				},
				{ context: publicContext }
			);

			expect(result.items).toHaveLength(2);
			expect(result.items[0]?.boat.id).toBe("boat-evening-weighted");
			expect(result.items[1]?.boat.id).toBe("boat-morning-weighted");
		} finally {
			vi.useRealTimers();
		}
	});

	it("checkoutReadModelPublic returns line items and policy summaries", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-checkout-model",
			organizationId: "org-1",
			name: "Checkout Model Boat",
			slug: "checkout-model-boat",
			status: "active",
			passengerCapacity: 8,
			minimumHours: 1,
			minimumNoticeMinutes: 120,
			workingHoursStart: 9,
			workingHoursEnd: 18,
			timezone: "UTC",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-checkout-model",
			boatId: "boat-checkout-model",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			serviceFeePercentage: 10,
			affiliateFeePercentage: 5,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		const result = await call(
			bookingRouter.checkoutReadModelPublic,
			{
				boatId: "boat-checkout-model",
				startsAt: new Date("2026-03-10T10:00:00.000Z"),
				endsAt: new Date("2026-03-10T12:00:00.000Z"),
				passengers: 2,
				locale: "en-US",
			},
			{ context: publicContext }
		);

		expect(result.boat.id).toBe("boat-checkout-model");
		expect(result.lineItems.length).toBeGreaterThan(0);
		expect(result.lineItems.some((item) => item.key === "pay_now")).toBe(true);
		expect(result.lineItems.some((item) => item.key === "total")).toBe(true);
		expect(
			result.policies.some((policy) => policy.key === "minimum_notice")
		).toBe(true);
		expect(result.totals.totalCents).toBe(
			result.pricingQuoteAfterDiscount.estimatedTotalPriceCents
		);
	});

	it("getByIdPublic handles cross-midnight windows and blocks overlapping midnight slots", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-night",
			organizationId: "org-1",
			name: "Night Boat",
			slug: "night-boat",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			minimumNoticeMinutes: 0,
			workingHoursStart: 18,
			workingHoursEnd: 2,
			timezone: "UTC",
		});

		await testDbState.db.insert(boatPricingProfile).values({
			id: "profile-night",
			boatId: "boat-night",
			name: "Night Base",
			currency: "RUB",
			baseHourlyPriceCents: 12_000,
			isDefault: true,
			validFrom: new Date("2026-01-01T00:00:00.000Z"),
		});

		await testDbState.db.insert(booking).values({
			id: "booking-midnight-block",
			organizationId: "org-1",
			boatId: "boat-night",
			source: "web",
			status: "confirmed",
			paymentStatus: "unpaid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-10T23:00:00.000Z"),
			endsAt: new Date("2026-03-11T00:00:00.000Z"),
			passengers: 2,
			timezone: "UTC",
			basePriceCents: 0,
			discountAmountCents: 0,
			totalPriceCents: 0,
			currency: "RUB",
		});

		const result = await call(
			bookingRouter.getByIdPublic,
			{
				boatId: "boat-night",
				date: "2026-03-10",
				durationHours: 1,
				passengers: 2,
			},
			{ context: publicContext }
		);

		expect(result.boat.id).toBe("boat-night");
		expect(result.slots.length).toBeGreaterThan(0);

		const slotStarts = result.slots.map((slot) => slot.startsAt.toISOString());
		expect(slotStarts).toContain("2026-03-10T22:00:00.000Z");
		expect(slotStarts).toContain("2026-03-11T00:00:00.000Z");
		expect(slotStarts).not.toContain("2026-03-10T23:00:00.000Z");
		expect(slotStarts).not.toContain("2026-03-10T22:30:00.000Z");
	});

	it("getByIdPublic resolves pricing profile by requested date (not current time)", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));

			await testDbState.db.insert(organization).values({
				id: "org-1",
				name: "Org",
				slug: "org",
			});

			await testDbState.db.insert(boat).values({
				id: "boat-future-pricing",
				organizationId: "org-1",
				name: "Future Pricing Boat",
				slug: "future-pricing-boat",
				status: "active",
				passengerCapacity: 10,
				minimumHours: 1,
				minimumNoticeMinutes: 0,
				workingHoursStart: 9,
				workingHoursEnd: 18,
				timezone: "UTC",
			});

			await testDbState.db.insert(boatPricingProfile).values({
				id: "profile-future-pricing",
				boatId: "boat-future-pricing",
				name: "Spring 2026",
				currency: "RUB",
				baseHourlyPriceCents: 12_000,
				isDefault: true,
				validFrom: new Date("2026-03-01T00:00:00.000Z"),
			});
			await testDbState.db.insert(boatPricingRule).values({
				id: "rule-future-pricing-evening",
				boatId: "boat-future-pricing",
				pricingProfileId: "profile-future-pricing",
				name: "Evening surcharge",
				ruleType: "time_window",
				conditionJson: JSON.stringify({ startHour: 18, endHour: 22 }),
				adjustmentType: "percentage",
				adjustmentValue: 15,
				priority: 100,
				isActive: true,
			});

			const result = await call(
				bookingRouter.getByIdPublic,
				{
					boatId: "boat-future-pricing",
					date: "2026-03-16",
					durationHours: 2,
					passengers: 2,
				},
				{ context: publicContext }
			);

			expect(result.pricingQuote).not.toBeNull();
			expect(result.pricingRules).toHaveLength(1);
			expect(result.pricingRules[0]?.id).toBe("rule-future-pricing-evening");
			expect(result.slots.length).toBeGreaterThan(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("getByIdPublic can include inactive boats when includeInactive=true", async () => {
		await testDbState.db.insert(organization).values({
			id: "org-1",
			name: "Org",
			slug: "org",
		});

		await testDbState.db.insert(boat).values({
			id: "boat-inactive-legacy",
			organizationId: "org-1",
			name: "Inactive Legacy Boat",
			slug: "inactive-legacy-boat",
			status: "draft",
			isActive: false,
			archivedAt: new Date("2026-01-01T00:00:00.000Z"),
			passengerCapacity: 6,
			minimumHours: 1,
			minimumNoticeMinutes: 0,
			workingHoursStart: 9,
			workingHoursEnd: 17,
			timezone: "UTC",
		});

		await expect(
			call(
				bookingRouter.getByIdPublic,
				{
					boatId: "boat-inactive-legacy",
					date: "2026-03-16",
					durationHours: 1,
					passengers: 2,
				},
				{ context: publicContext }
			)
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		const included = await call(
			bookingRouter.getByIdPublic,
			{
				boatId: "boat-inactive-legacy",
				date: "2026-03-16",
				durationHours: 1,
				passengers: 2,
				includeInactive: true,
			},
			{ context: publicContext }
		);

		expect(included.boat.id).toBe("boat-inactive-legacy");
	});
});
