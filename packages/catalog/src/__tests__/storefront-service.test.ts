import { organization } from "@my-app/db/schema/auth";
import {
	listing,
	listingAsset,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import {
	searchPublishedListings,
	getPublishedListing,
} from "../storefront-service";

const ORG_ID = "sf-test-org";
const LISTING_TYPE_SLUG = "sf-listing-type";
const LISTING_ID = "sf-listing-1";
const UNPUBLISHED_ID = "sf-listing-unpublished";
const ASSET_KEY = "images/primary.jpg";

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Storefront Test Org",
			slug: "storefront-test-org",
		});
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});

		// Published listing
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Ocean Retreat",
			slug: "ocean-retreat",
			description: "A beautiful ocean retreat",
			isActive: true,
			status: "active",
			timezone: "UTC",
		});
		await db.insert(listingPublication).values({
			id: crypto.randomUUID(),
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "platform_marketplace",
			isActive: true,
			visibility: "public",
			merchantType: "platform",
		});
		await db.insert(listingAsset).values({
			id: crypto.randomUUID(),
			listingId: LISTING_ID,
			kind: "image",
			storageKey: ASSET_KEY,
			isPrimary: true,
			sortOrder: 0,
		});

		// Unpublished listing (no listingPublication)
		await db.insert(listing).values({
			id: UNPUBLISHED_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Hidden Lodge",
			slug: "hidden-lodge",
			isActive: false,
			status: "draft",
			timezone: "UTC",
		});
	},
	seedStrategy: "beforeAll",
});

type Db = Parameters<typeof searchPublishedListings>[1];

describe("searchPublishedListings", () => {
	it("returns only published marketplace listings", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings({}, db);

		expect(result.items.length).toBe(1);
		expect(result.items[0]?.id).toBe(LISTING_ID);
		expect(result.total).toBe(1);
	});

	it("includes primary image key from listingAsset", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings({}, db);

		expect(result.items[0]?.primaryImageKey).toBe(ASSET_KEY);
	});

	it("filters by listingTypeSlug", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings(
			{ type: LISTING_TYPE_SLUG },
			db,
		);
		expect(result.items.length).toBe(1);

		const noMatch = await searchPublishedListings({ type: "nonexistent" }, db);
		expect(noMatch.items.length).toBe(0);
	});

	it("filters by keyword (ILIKE on listing name)", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings({ q: "ocean" }, db);
		expect(result.items.length).toBe(1);
		expect(result.items[0]?.name).toBe("Ocean Retreat");

		const noMatch = await searchPublishedListings({ q: "zzznomatch" }, db);
		expect(noMatch.items.length).toBe(0);
	});

	it("excludes listings that are not published", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings({}, db);
		const ids = result.items.map((i) => i.id);
		expect(ids).not.toContain(UNPUBLISHED_ID);
	});
});

describe("getPublishedListing", () => {
	it("returns detail for a published listing", async () => {
		const db = testDbState.db as unknown as Db;
		const item = await getPublishedListing(LISTING_ID, db);

		expect(item.id).toBe(LISTING_ID);
		expect(item.name).toBe("Ocean Retreat");
		expect(item.primaryImageKey).toBe(ASSET_KEY);
	});

	it("throws NOT_FOUND for an unpublished listing", async () => {
		const db = testDbState.db as unknown as Db;
		await expect(
			getPublishedListing(UNPUBLISHED_ID, db),
		).rejects.toThrow("NOT_FOUND");
	});

	it("throws NOT_FOUND for a non-existent listing", async () => {
		const db = testDbState.db as unknown as Db;
		await expect(
			getPublishedListing("does-not-exist", db),
		).rejects.toThrow("NOT_FOUND");
	});
});
