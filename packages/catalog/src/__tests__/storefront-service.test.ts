import { organization } from "@my-app/db/schema/auth";
import {
	listing,
	listingAsset,
	listingBoatRentProfile,
	listingExcursionProfile,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import {
	createFakeStorageProvider,
	LISTING_PUBLIC_STORAGE_PROVIDER,
	registerStorageProvider,
	resetStorageProviderRegistry,
} from "@my-app/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	getPublishedListing,
	searchPublishedListings,
} from "../storefront-service";

const ORG_ID = "sf-test-org";
const LISTING_TYPE_SLUG = "sf-listing-type";
const EXCURSION_TYPE_SLUG = "sf-excursion-type";
const LISTING_ID = "sf-listing-1";
const EXCURSION_ID = "sf-listing-excursion";
const UNPUBLISHED_ID = "sf-listing-unpublished";
const ASSET_KEY = "images/primary.jpg";
const ASSET_URL = `https://media.example.test/${LISTING_PUBLIC_STORAGE_PROVIDER}/${ASSET_KEY}`;

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
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: EXCURSION_TYPE_SLUG,
			label: "Excursion Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 1,
			serviceFamily: "excursions",
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
			storageProvider: LISTING_PUBLIC_STORAGE_PROVIDER,
			storageKey: ASSET_KEY,
			access: "public",
			isPrimary: true,
			sortOrder: 0,
		});
		await db.insert(listingBoatRentProfile).values({
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			capacity: 12,
			captainMode: "captain_optional",
			basePort: "Sochi Marine Station",
			departureArea: "Imeretinskaya Bay",
			fuelPolicy: "charged_by_usage",
			depositRequired: true,
			instantBookAllowed: false,
		});

		// Published excursion listing
		await db.insert(listing).values({
			id: EXCURSION_ID,
			organizationId: ORG_ID,
			listingTypeSlug: EXCURSION_TYPE_SLUG,
			name: "Historic Walk",
			slug: "historic-walk",
			description: "Guided city-center excursion",
			isActive: true,
			status: "active",
			timezone: "UTC",
		});
		await db.insert(listingPublication).values({
			id: crypto.randomUUID(),
			listingId: EXCURSION_ID,
			organizationId: ORG_ID,
			channelType: "platform_marketplace",
			isActive: true,
			visibility: "public",
			merchantType: "platform",
		});
		await db.insert(listingExcursionProfile).values({
			listingId: EXCURSION_ID,
			organizationId: ORG_ID,
			meetingPoint: "Central fountain",
			durationMinutes: 180,
			groupFormat: "both",
			maxGroupSize: 12,
			primaryLanguage: "English",
			ticketsIncluded: true,
			childFriendly: true,
			instantBookAllowed: true,
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

beforeAll(() => {
	registerStorageProvider(
		createFakeStorageProvider({
			providerId: LISTING_PUBLIC_STORAGE_PROVIDER,
			publicBaseUrl: `https://media.example.test/${LISTING_PUBLIC_STORAGE_PROVIDER}`,
		})
	);
});

afterAll(() => {
	resetStorageProviderRegistry();
});

describe("searchPublishedListings", () => {
	it("returns only published marketplace listings", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings({}, db);

		expect(result.items.length).toBe(2);
		expect(result.items.map((item) => item.id)).toEqual(
			expect.arrayContaining([LISTING_ID, EXCURSION_ID])
		);
		expect(result.total).toBe(2);
	});

	it("includes primary image url from listingAsset", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings({}, db);

		expect(result.items[0]?.primaryImageUrl).toBe(ASSET_URL);
	});

	it("filters by listingTypeSlug", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings(
			{ type: LISTING_TYPE_SLUG },
			db
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

	it("returns typed excursion summaries for excursion listings", async () => {
		const db = testDbState.db as unknown as Db;
		const result = await searchPublishedListings(
			{ type: EXCURSION_TYPE_SLUG },
			db
		);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.excursionSummary).toMatchObject({
			meetingPoint: "Central fountain",
			durationMinutes: 180,
			durationLabel: "3 hours",
			groupFormat: "both",
			groupFormatLabel: "Private or group",
			primaryLanguage: "English",
			ticketsIncluded: true,
		});
	});
});

describe("getPublishedListing", () => {
	it("returns detail for a published listing", async () => {
		const db = testDbState.db as unknown as Db;
		const item = await getPublishedListing(LISTING_ID, db);

		expect(item.id).toBe(LISTING_ID);
		expect(item.name).toBe("Ocean Retreat");
		expect(item.listingTypeLabel).toBe("Test Type");
		expect(item.serviceFamily).toBe("boat_rent");
		expect(item.serviceFamilyPolicy).toMatchObject({
			key: "boat_rent",
			customerPresentation: {
				bookingMode: "request",
				customerFocus: "asset",
				reviewsMode: "standard",
			},
		});
		expect(item.boatRentSummary).toMatchObject({
			capacity: 12,
			captainMode: "captain_optional",
			captainModeLabel: "Captain optional",
			basePort: "Sochi Marine Station",
			departureArea: "Imeretinskaya Bay",
			fuelPolicyLabel: "Fuel charged by usage",
		});
		expect(item.primaryImageUrl).toBe(ASSET_URL);
	});

	it("throws NOT_FOUND for an unpublished listing", async () => {
		const db = testDbState.db as unknown as Db;
		await expect(getPublishedListing(UNPUBLISHED_ID, db)).rejects.toThrow(
			"NOT_FOUND"
		);
	});

	it("returns excursion detail for a published excursion listing", async () => {
		const db = testDbState.db as unknown as Db;
		const item = await getPublishedListing(EXCURSION_ID, db);

		expect(item.serviceFamily).toBe("excursions");
		expect(item.excursionSummary).toMatchObject({
			meetingPoint: "Central fountain",
			durationMinutes: 180,
			durationLabel: "3 hours",
			groupFormatLabel: "Private or group",
			maxGroupSize: 12,
			primaryLanguage: "English",
			ticketsIncluded: true,
			childFriendly: true,
		});
	});

	it("throws NOT_FOUND for a non-existent listing", async () => {
		const db = testDbState.db as unknown as Db;
		await expect(getPublishedListing("does-not-exist", db)).rejects.toThrow(
			"NOT_FOUND"
		);
	});
});
