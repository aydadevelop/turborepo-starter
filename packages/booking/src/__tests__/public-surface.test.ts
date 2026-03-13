import { organization } from "@my-app/db/schema/auth";
import {
	listingAvailabilityBlock,
	listingAvailabilityRule,
	listingMinimumDurationRule,
} from "@my-app/db/schema/availability";
import {
	booking,
	bookingDiscountCode,
	listing,
	listingPricingProfile,
	listingPricingRule,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import { getPublicBookingSurface } from "../public-surface";
import type { Db } from "../types";

const ORG_ID = "public-surface-org";
const BOAT_TYPE_SLUG = "public-surface-boat";
const EXCURSION_TYPE_SLUG = "public-surface-excursion";
const BOAT_LISTING_ID = "public-surface-boat-listing";
const NOTICE_LISTING_ID = "public-surface-notice-listing";
const MIN_DURATION_LISTING_ID = "public-surface-min-duration-listing";
const EXCURSION_LISTING_ID = "public-surface-excursion-listing";
const TARGET_DATE = "2030-01-15";
const TARGET_WEEKDAY = new Date(`${TARGET_DATE}T00:00:00.000Z`).getUTCDay();

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Public Surface Org",
			slug: "public-surface-org",
		});

		await db.insert(listingTypeConfig).values([
			{
				id: BOAT_TYPE_SLUG,
				slug: BOAT_TYPE_SLUG,
				label: "Boat Rent",
				serviceFamily: "boat_rent",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 0,
			},
			{
				id: EXCURSION_TYPE_SLUG,
				slug: EXCURSION_TYPE_SLUG,
				label: "Excursion",
				serviceFamily: "excursions",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 1,
			},
		]);

		await db.insert(listing).values([
			{
				id: BOAT_LISTING_ID,
				organizationId: ORG_ID,
				listingTypeSlug: BOAT_TYPE_SLUG,
				name: "Ocean Retreat",
				slug: "ocean-retreat",
				timezone: "UTC",
				minimumDurationMinutes: 60,
				minimumNoticeMinutes: 0,
				workingHoursStart: 9,
				workingHoursEnd: 13,
				isActive: true,
				status: "active",
			},
			{
				id: NOTICE_LISTING_ID,
				organizationId: ORG_ID,
				listingTypeSlug: BOAT_TYPE_SLUG,
				name: "Notice Boat",
				slug: "notice-boat",
				timezone: "UTC",
				minimumDurationMinutes: 60,
				minimumNoticeMinutes: 120,
				workingHoursStart: 9,
				workingHoursEnd: 12,
				isActive: true,
				status: "active",
			},
			{
				id: MIN_DURATION_LISTING_ID,
				organizationId: ORG_ID,
				listingTypeSlug: BOAT_TYPE_SLUG,
				name: "Long Charter",
				slug: "long-charter",
				timezone: "UTC",
				minimumDurationMinutes: 60,
				minimumNoticeMinutes: 0,
				workingHoursStart: 9,
				workingHoursEnd: 12,
				isActive: true,
				status: "active",
			},
			{
				id: EXCURSION_LISTING_ID,
				organizationId: ORG_ID,
				listingTypeSlug: EXCURSION_TYPE_SLUG,
				name: "Historic Walk",
				slug: "historic-walk",
				timezone: "UTC",
				minimumDurationMinutes: 60,
				minimumNoticeMinutes: 0,
				workingHoursStart: 9,
				workingHoursEnd: 12,
				isActive: true,
				status: "active",
			},
		]);

		await db.insert(listingPublication).values([
			{
				id: "pub-boat",
				listingId: BOAT_LISTING_ID,
				organizationId: ORG_ID,
				channelType: "platform_marketplace",
				isActive: true,
				visibility: "public",
				merchantType: "platform",
			},
			{
				id: "pub-notice",
				listingId: NOTICE_LISTING_ID,
				organizationId: ORG_ID,
				channelType: "platform_marketplace",
				isActive: true,
				visibility: "public",
				merchantType: "platform",
			},
			{
				id: "pub-min-duration",
				listingId: MIN_DURATION_LISTING_ID,
				organizationId: ORG_ID,
				channelType: "platform_marketplace",
				isActive: true,
				visibility: "public",
				merchantType: "platform",
			},
			{
				id: "pub-excursion",
				listingId: EXCURSION_LISTING_ID,
				organizationId: ORG_ID,
				channelType: "platform_marketplace",
				isActive: true,
				visibility: "public",
				merchantType: "platform",
			},
		]);

		await db.insert(listingAvailabilityRule).values([
			{
				id: "rule-boat",
				listingId: BOAT_LISTING_ID,
				dayOfWeek: TARGET_WEEKDAY,
				startMinute: 9 * 60,
				endMinute: 13 * 60,
				isActive: true,
			},
			{
				id: "rule-notice",
				listingId: NOTICE_LISTING_ID,
				dayOfWeek: TARGET_WEEKDAY,
				startMinute: 9 * 60,
				endMinute: 12 * 60,
				isActive: true,
			},
			{
				id: "rule-min-duration",
				listingId: MIN_DURATION_LISTING_ID,
				dayOfWeek: TARGET_WEEKDAY,
				startMinute: 9 * 60,
				endMinute: 12 * 60,
				isActive: true,
			},
		]);

		await db.insert(listingAvailabilityBlock).values({
			id: "block-boat",
			listingId: BOAT_LISTING_ID,
			source: "manual",
			startsAt: new Date(`${TARGET_DATE}T11:00:00.000Z`),
			endsAt: new Date(`${TARGET_DATE}T12:00:00.000Z`),
			reason: "Maintenance window",
			isActive: true,
		});

		await db.insert(booking).values({
			id: "booking-boat-busy",
			organizationId: ORG_ID,
			listingId: BOAT_LISTING_ID,
			publicationId: "pub-boat",
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "confirmed",
			startsAt: new Date(`${TARGET_DATE}T09:00:00.000Z`),
			endsAt: new Date(`${TARGET_DATE}T10:00:00.000Z`),
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
		});

		await db.insert(listingPricingProfile).values([
			{
				id: "profile-boat",
				listingId: BOAT_LISTING_ID,
				name: "Default boat pricing",
				currency: "RUB",
				baseHourlyPriceCents: 10_000,
				minimumHours: 1,
				isDefault: true,
			},
			{
				id: "profile-notice",
				listingId: NOTICE_LISTING_ID,
				name: "Default notice pricing",
				currency: "RUB",
				baseHourlyPriceCents: 8_000,
				minimumHours: 1,
				isDefault: true,
			},
			{
				id: "profile-min-duration",
				listingId: MIN_DURATION_LISTING_ID,
				name: "Default min duration pricing",
				currency: "RUB",
				baseHourlyPriceCents: 12_000,
				minimumHours: 1,
				isDefault: true,
			},
		]);

		await db.insert(listingPricingRule).values({
			id: "rule-special-pricing",
			listingId: BOAT_LISTING_ID,
			pricingProfileId: "profile-boat",
			name: "20 percent markup",
			ruleType: "dayOfWeek",
			conditionJson: { alwaysApply: true },
			adjustmentType: "percent",
			adjustmentValue: 20,
			priority: 0,
			isActive: true,
		});

		await db.insert(listingMinimumDurationRule).values({
			id: "min-duration-rule",
			listingId: MIN_DURATION_LISTING_ID,
			startHour: 9,
			startMinute: 0,
			endHour: 12,
			endMinute: 0,
			minimumDurationMinutes: 120,
			daysOfWeek: [TARGET_WEEKDAY],
			isActive: true,
		});

		await db.insert(bookingDiscountCode).values({
			id: "discount-boat-surface",
			organizationId: ORG_ID,
			appliesToListingId: BOAT_LISTING_ID,
			code: "SURFACE10",
			name: "Surface ten percent",
			discountType: "percentage",
			discountValue: 10,
			minimumSubtotalCents: 0,
			isActive: true,
		});
	},
	seedStrategy: "beforeAll",
});

const getDb = () => testDbState.db as unknown as Db;

async function measureQueryCount<T>(
	run: (db: Db) => Promise<T>,
): Promise<{ queryCount: number; result: T }> {
	const db = getDb();
	const client = (db as unknown as {
		$client?: { _runExclusiveQuery?: (...args: unknown[]) => unknown };
	}).$client;
	if (!client?._runExclusiveQuery) {
		throw new Error("TEST_DB_CLIENT_UNAVAILABLE");
	}

	const originalRunExclusiveQuery = client._runExclusiveQuery.bind(client);
	let queryCount = 0;

	client._runExclusiveQuery = async (...args: unknown[]) => {
		queryCount += 1;
		return originalRunExclusiveQuery(...args);
	};

	try {
		const result = await run(db);
		return { queryCount, result };
	} finally {
		client._runExclusiveQuery = originalRunExclusiveQuery;
	}
}

describe("getPublicBookingSurface", () => {
	it("returns boat-rent slots with blocked and special-pricing states", async () => {
		const surface = await getPublicBookingSurface(
			{
				listingId: BOAT_LISTING_ID,
				date: TARGET_DATE,
				durationMinutes: 60,
				passengers: 6,
			},
			getDb(),
			{ now: new Date("2030-01-14T08:00:00.000Z") },
		);

		expect(surface.serviceFamily).toBe("boat_rent");
		expect(surface.pricingConfigured).toBe(true);
		expect(surface.durationOptionsMinutes).toEqual([60]);
		expect(surface.summary).toMatchObject({
			totalSlotCount: 7,
			availableSlotCount: 2,
			blockedSlotCount: 5,
			specialPricedSlotCount: 2,
		});

		expect(
			surface.slots.map((slot) => ({
				start: slot.startsAtLabel,
				status: slot.status,
				reason: slot.blockReason,
			})),
		).toEqual([
			{ start: "09:00", status: "blocked", reason: "Already booked" },
			{ start: "09:30", status: "blocked", reason: "Already booked" },
			{ start: "10:00", status: "available", reason: null },
			{ start: "10:30", status: "blocked", reason: "Maintenance window" },
			{ start: "11:00", status: "blocked", reason: "Maintenance window" },
			{ start: "11:30", status: "blocked", reason: "Maintenance window" },
			{ start: "12:00", status: "available", reason: null },
		]);

		expect(surface.slots.find((slot) => slot.startsAtLabel === "10:00")?.quote)
			.toMatchObject({
				currency: "RUB",
				baseCents: 10_000,
				adjustmentCents: 2_000,
				totalCents: 12_000,
				hasSpecialPricing: true,
			});
	});

	it("marks slots that violate minimum notice or minimum duration rules", async () => {
		const noticeSurface = await getPublicBookingSurface(
			{
				listingId: NOTICE_LISTING_ID,
				date: TARGET_DATE,
				durationMinutes: 60,
			},
			getDb(),
			{ now: new Date("2030-01-15T08:45:00.000Z") },
		);

		expect(
			noticeSurface.slots.map((slot) => ({
				start: slot.startsAtLabel,
				status: slot.status,
			})),
		).toEqual([
			{ start: "09:00", status: "notice_too_short" },
			{ start: "09:30", status: "notice_too_short" },
			{ start: "10:00", status: "notice_too_short" },
			{ start: "10:30", status: "notice_too_short" },
			{ start: "11:00", status: "available" },
		]);

		const durationSurface = await getPublicBookingSurface(
			{
				listingId: MIN_DURATION_LISTING_ID,
				date: TARGET_DATE,
				durationMinutes: 60,
			},
			getDb(),
			{ now: new Date("2030-01-14T08:00:00.000Z") },
		);

		expect(durationSurface.durationOptionsMinutes).toEqual([60, 120]);
		expect(durationSurface.summary.minimumDurationSlotCount).toBeGreaterThan(0);
		expect(durationSurface.slots.every((slot) => slot.status === "minimum_duration_not_met")).toBe(
			true,
		);
		expect(durationSurface.slots[0]?.minimumDurationMinutes).toBe(120);
	});

	it("adds discount previews to available slots when a valid code is requested", async () => {
		const surface = await getPublicBookingSurface(
			{
				listingId: BOAT_LISTING_ID,
				date: TARGET_DATE,
				durationMinutes: 60,
				passengers: 4,
				discountCode: "surface10",
			},
			getDb(),
			{
				customerUserId: "surface-user",
				now: new Date("2030-01-14T08:00:00.000Z"),
			},
		);

		expect(surface.requestedDiscountCode).toBe("SURFACE10");

		const discountedSlot = surface.slots.find(
			(slot) => slot.startsAtLabel === "10:00",
		);
		expect(discountedSlot?.quote?.discountPreview).toMatchObject({
			code: "SURFACE10",
			status: "applied",
			appliedAmountCents: 1_200,
			discountedSubtotalCents: 10_800,
			discountedTotalCents: 10_800,
		});
	});

	it("keeps booking-surface query count bounded per request", async () => {
		const withoutDiscount = await measureQueryCount((db) =>
			getPublicBookingSurface(
				{
					listingId: BOAT_LISTING_ID,
					date: TARGET_DATE,
					durationMinutes: 60,
					passengers: 6,
				},
				db,
				{ now: new Date("2030-01-14T08:00:00.000Z") },
			),
		);

		expect(withoutDiscount.result.summary.availableSlotCount).toBe(2);
		expect(withoutDiscount.queryCount).toBeLessThanOrEqual(8);

		const withDiscount = await measureQueryCount((db) =>
			getPublicBookingSurface(
				{
					listingId: BOAT_LISTING_ID,
					date: TARGET_DATE,
					durationMinutes: 60,
					passengers: 4,
					discountCode: "surface10",
				},
				db,
				{
					customerUserId: "surface-user",
					now: new Date("2030-01-14T08:00:00.000Z"),
				},
			),
		);

		expect(withDiscount.result.summary.availableSlotCount).toBe(2);
		expect(withDiscount.queryCount).toBeLessThanOrEqual(9);
	});

	it("rejects non-boat-rent listings", async () => {
		await expect(
			getPublicBookingSurface(
				{
					listingId: EXCURSION_LISTING_ID,
					date: TARGET_DATE,
					durationMinutes: 60,
				},
				getDb(),
			),
		).rejects.toThrow("NOT_SUPPORTED");
	});
});
