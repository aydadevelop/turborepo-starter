import { organization } from "@my-app/db/schema/auth";
import {
	listing,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import {
	bootstrapTestDatabase,
	type TestDatabase,
} from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import {
	createPricingProfile,
	createPricingRule,
	deletePricingRule,
	listPricingProfiles,
	updatePricingProfile,
} from "../pricing-service";
import type { Db } from "../types";

const ORG_ID = "ps-org-1";
const OTHER_ORG_ID = "ps-org-2";
const LISTING_ID = "ps-listing-1";

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: "test",
			label: "T",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values([
			{ id: ORG_ID, name: "Main Org", slug: "main-org" },
			{ id: OTHER_ORG_ID, name: "Other Org", slug: "other-org" },
		]);
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: "test",
			name: "Service Listing",
			slug: "service-listing",
		});
	},
	seedStrategy: "beforeAll",
});

const getDb = () => testDbState.db as unknown as Db;

describe("createPricingProfile", () => {
	it("creates a profile with correct values", async () => {
		const profile = await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "Standard",
				currency: "USD",
				baseHourlyPriceCents: 5000,
				serviceFeeBps: 500,
				taxBps: 200,
				isDefault: false,
			},
			getDb(),
		);

		expect(profile.id).toBeTruthy();
		expect(profile.name).toBe("Standard");
		expect(profile.baseHourlyPriceCents).toBe(5000);
		expect(profile.currency).toBe("USD");
		expect(profile.isDefault).toBe(false);
	});

	it("setting isDefault=true clears previous default", async () => {
		const db = getDb();
		const first = await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "First Default",
				currency: "USD",
				baseHourlyPriceCents: 8000,
				isDefault: true,
			},
			db,
		);
		expect(first.isDefault).toBe(true);

		const second = await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "New Default",
				currency: "USD",
				baseHourlyPriceCents: 9000,
				isDefault: true,
			},
			db,
		);
		expect(second.isDefault).toBe(true);

		const profiles = await listPricingProfiles(LISTING_ID, ORG_ID, db);
		const defaults = profiles.filter((p) => p.isDefault);
		expect(defaults.length).toBe(1);
		expect(defaults[0]!.id).toBe(second.id);
	});

	it("throws NOT_FOUND for wrong organization", async () => {
		await expect(
			createPricingProfile(
				{
					listingId: LISTING_ID,
					organizationId: OTHER_ORG_ID,
					name: "Fail",
					currency: "USD",
					baseHourlyPriceCents: 1000,
				},
				getDb(),
			),
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listPricingProfiles", () => {
	it("returns profiles ordered by isDefault desc then createdAt asc", async () => {
		const db = getDb();
		await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "List Test Non-default",
				currency: "USD",
				baseHourlyPriceCents: 2000,
				isDefault: false,
			},
			db,
		);
		await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "List Test Default",
				currency: "USD",
				baseHourlyPriceCents: 2500,
				isDefault: true,
			},
			db,
		);
		const profiles = await listPricingProfiles(LISTING_ID, ORG_ID, db);
		expect(profiles.length).toBeGreaterThanOrEqual(2);
		// The default profile should come first
		expect(profiles[0]!.isDefault).toBe(true);
	});
});

describe("updatePricingProfile", () => {
	it("updates profile fields", async () => {
		const db = getDb();
		const created = await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "To Update",
				currency: "EUR",
				baseHourlyPriceCents: 3000,
			},
			db,
		);

		const updated = await updatePricingProfile(
			{ id: created.id, organizationId: ORG_ID, name: "Updated", baseHourlyPriceCents: 4000 },
			db,
		);

		expect(updated.name).toBe("Updated");
		expect(updated.baseHourlyPriceCents).toBe(4000);
	});
});

describe("createPricingRule / deletePricingRule", () => {
	it("creates and deletes a pricing rule", async () => {
		const db = getDb();
		const profile = await createPricingProfile(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				name: "Rule Profile",
				currency: "USD",
				baseHourlyPriceCents: 7000,
			},
			db,
		);

		const rule = await createPricingRule(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				pricingProfileId: profile.id,
				name: "Weekend 10%",
				ruleType: "dayOfWeek",
				conditionJson: { days: [0, 6] },
				adjustmentType: "percent",
				adjustmentValue: 10,
				priority: 1,
			},
			db,
		);

		expect(rule.ruleType).toBe("dayOfWeek");
		expect(rule.adjustmentValue).toBe(10);
		expect(rule.isActive).toBe(true);

		await expect(deletePricingRule(rule.id, ORG_ID, db)).resolves.toBeUndefined();
	});

	it("throws NOT_FOUND for unknown rule id", async () => {
		await expect(deletePricingRule("nonexistent", ORG_ID, getDb())).rejects.toThrow("NOT_FOUND");
	});
});
