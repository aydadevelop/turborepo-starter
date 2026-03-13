import { organization } from "@my-app/db/schema/auth";
import {
	listing,
	listingPricingProfile,
	listingPricingRule,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import {
	bootstrapTestDatabase,
	type TestDatabase,
} from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import {
	calculateQuote,
	calculateQuoteFromResolvedPricing,
} from "../quote-service";
import { resolveDefaultPricingContext } from "../pricing-profile";
import type { Db } from "../types";

const ORG_ID = "pricing-org-1";
const LISTING_ID = "pricing-listing-1";
const LISTING_ID_NO_PROFILE = "pricing-listing-no-profile";
const LISTING_ID_PRELOADED = "pricing-listing-preloaded";

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: "test-type",
			label: "Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values({ id: ORG_ID, name: "Org", slug: "pricing-org" });
		await db.insert(listing).values([
			{
				id: LISTING_ID,
				organizationId: ORG_ID,
				listingTypeSlug: "test-type",
				name: "Priced Listing",
				slug: "priced-listing",
			},
			{
				id: LISTING_ID_NO_PROFILE,
				organizationId: ORG_ID,
				listingTypeSlug: "test-type",
				name: "No Profile",
				slug: "no-profile",
			},
			{
				id: LISTING_ID_PRELOADED,
				organizationId: ORG_ID,
				listingTypeSlug: "test-type",
				name: "Preloaded Profile",
				slug: "preloaded-profile",
			},
		]);
	},
	seedStrategy: "beforeAll",
});

const getDb = () => testDbState.db as unknown as Db;

describe("calculateQuote", () => {
	it("returns correct breakdown for a 2-hour slot with no rules", async () => {
		const db = getDb();
		await db.insert(listingPricingProfile).values({
			id: "profile-base",
			listingId: LISTING_ID,
			name: "Base",
			currency: "USD",
			baseHourlyPriceCents: 10000,
			serviceFeeBps: 1000,
			taxBps: 500,
			isDefault: true,
		});

		const startsAt = new Date("2026-06-01T10:00:00Z");
		const endsAt = new Date("2026-06-01T12:00:00Z");

		const quote = await calculateQuote({ listingId: LISTING_ID, startsAt, endsAt }, db);

		expect(quote.durationMinutes).toBe(120);
		expect(quote.baseCents).toBe(20000);
		expect(quote.adjustmentCents).toBe(0);
		// serviceFeeCents = round(20000 * 1000 / 10000) = 2000
		expect(quote.serviceFeeCents).toBe(2000);
		// taxCents = round((20000 + 2000) * 500 / 10000) = round(1100) = 1100
		expect(quote.taxCents).toBe(1100);
		expect(quote.totalCents).toBe(23100);
		expect(quote.currency).toBe("USD");
		expect(quote.profileId).toBe("profile-base");
	});

	it("matches async quote calculation when profile and rules are preloaded", async () => {
		const db = getDb();
		await db.insert(listingPricingProfile).values({
			id: "profile-preloaded",
			listingId: LISTING_ID_PRELOADED,
			name: "Preloaded",
			currency: "USD",
			baseHourlyPriceCents: 15_000,
			serviceFeeBps: 500,
			taxBps: 1000,
			isDefault: true,
		});
		await db.insert(listingPricingRule).values({
			id: "rule-preloaded",
			listingId: LISTING_ID_PRELOADED,
			pricingProfileId: "profile-preloaded",
			name: "Passenger uplift",
			ruleType: "passengerCount",
			conditionJson: { minPassengers: 4 },
			adjustmentType: "flat_cents",
			adjustmentValue: 2_000,
			priority: 1,
			isActive: true,
		});

		const startsAt = new Date("2026-06-02T10:00:00Z");
		const endsAt = new Date("2026-06-02T12:00:00Z");

		const asyncQuote = await calculateQuote(
			{ listingId: LISTING_ID_PRELOADED, startsAt, endsAt, passengers: 4 },
			db,
		);

		const context = await resolveDefaultPricingContext(LISTING_ID_PRELOADED, db);
		if (!context) {
			throw new Error("Expected resolved pricing context");
		}

		const preloadedQuote = calculateQuoteFromResolvedPricing(
			{ listingId: LISTING_ID_PRELOADED, startsAt, endsAt, passengers: 4 },
			context,
		);

		expect(preloadedQuote).toEqual(asyncQuote);
	});

	it("returns null when no default pricing profile exists", async () => {
		const db = getDb();

		await expect(
			resolveDefaultPricingContext(LISTING_ID_NO_PROFILE, db),
		).resolves.toBeNull();
	});

	it("applies dayOfWeek percent rule (20% markup) correctly", async () => {
		const db = getDb();
		await db.insert(listingPricingProfile).values({
			id: "profile-with-rule",
			listingId: LISTING_ID,
			name: "With Rule",
			currency: "USD",
			baseHourlyPriceCents: 10000,
			serviceFeeBps: 1000,
			taxBps: 500,
			isDefault: false,
		});
		await db.insert(listingPricingRule).values({
			id: "rule-dow",
			listingId: LISTING_ID,
			pricingProfileId: "profile-with-rule",
			name: "Weekend markup",
			ruleType: "dayOfWeek",
			conditionJson: { alwaysApply: true },
			adjustmentType: "percent",
			adjustmentValue: 20,
			priority: 0,
			isActive: true,
		});

		// Temporarily swap default
		await db.insert(listingPricingProfile).values({
			id: "profile-rule-default",
			listingId: LISTING_ID,
			name: "With Rule Default",
			currency: "USD",
			baseHourlyPriceCents: 10000,
			serviceFeeBps: 1000,
			taxBps: 500,
			isDefault: false,
		});
		// Use profile-with-rule as a non-default; test calculateQuote with explicit profileId override
		// Since calculateQuote uses the default, seed a different listing with the rule profile as default
		await db.insert(organization).values({ id: "rule-org", name: "Rule Org", slug: "rule-org" }).catch(() => {});
		await db.insert(listing).values({
			id: "rule-listing",
			organizationId: "rule-org",
			listingTypeSlug: "test-type",
			name: "Rule Listing",
			slug: "rule-listing",
		});
		await db.insert(listingPricingProfile).values({
			id: "rule-profile-default",
			listingId: "rule-listing",
			name: "Rule Profile",
			currency: "USD",
			baseHourlyPriceCents: 10000,
			serviceFeeBps: 1000,
			taxBps: 500,
			isDefault: true,
		});
		await db.insert(listingPricingRule).values({
			id: "rule-dow-2",
			listingId: "rule-listing",
			pricingProfileId: "rule-profile-default",
			name: "20% markup",
			ruleType: "dayOfWeek",
			conditionJson: { alwaysApply: true },
			adjustmentType: "percent",
			adjustmentValue: 20,
			priority: 0,
			isActive: true,
		});

		const startsAt = new Date("2026-06-01T10:00:00Z");
		const endsAt = new Date("2026-06-01T12:00:00Z");

		const quote = await calculateQuote({ listingId: "rule-listing", startsAt, endsAt }, db);

		expect(quote.baseCents).toBe(20000);
		// adjustmentCents = round(20000 * 20 / 100) = 4000
		expect(quote.adjustmentCents).toBe(4000);
		// subtotal = 24000; serviceFeeCents = round(24000 * 1000 / 10000) = 2400
		expect(quote.serviceFeeCents).toBe(2400);
		// taxCents = round((24000 + 2400) * 500 / 10000) = round(1320) = 1320
		expect(quote.taxCents).toBe(1320);
		expect(quote.totalCents).toBe(27720);
	});

	it("throws NO_PRICING_PROFILE when listing has no default profile", async () => {
		await expect(
			calculateQuote(
				{
					listingId: LISTING_ID_NO_PROFILE,
					startsAt: new Date("2026-06-01T10:00:00Z"),
					endsAt: new Date("2026-06-01T12:00:00Z"),
				},
				getDb(),
			),
		).rejects.toThrow("NO_PRICING_PROFILE");
	});
});
