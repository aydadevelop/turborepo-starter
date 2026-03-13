import { organization } from "@my-app/db/schema/auth";
import {
	listingBoatRentProfile,
	listingExcursionProfile,
	listingPublication,
	listingTypeConfig,
	organizationListingType,
	organizationSettings,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
	createListing,
	getCreateListingEditorState,
	getListing,
	getListingWorkspaceState,
	listAvailableListingTypes,
	listListings,
	updateListing,
} from "../listing-service";
import { publishListing, unpublishListing } from "../publication-service";

const ORG_ID = "test-org-1";
const LISTING_TYPE_SLUG = "test-listing-type";
const EXCURSION_TYPE_SLUG = "test-excursion-type";

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values([
			{
				id: crypto.randomUUID(),
				slug: LISTING_TYPE_SLUG,
				label: "Test Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 0,
			},
			{
				id: crypto.randomUUID(),
				slug: EXCURSION_TYPE_SLUG,
				label: "Excursion Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 1,
				serviceFamily: "excursions",
			},
		]);
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Test Org",
			slug: "test-org",
		});
	},
	seedStrategy: "beforeAll",
});

const makeInput = (
	overrides?: Partial<Parameters<typeof createListing>[0]>
) => ({
	organizationId: ORG_ID,
	listingTypeSlug: LISTING_TYPE_SLUG,
	name: "My Listing",
	slug: "my-listing",
	...overrides,
});

describe("createListing", () => {
	it("creates a listing with draft status", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const row = await createListing(makeInput(), db);

		expect(row.id).toBeTruthy();
		expect(row.name).toBe("My Listing");
		expect(row.status).toBe("draft");
		expect(row.isActive).toBe(true);
		expect(row.organizationId).toBe(ORG_ID);
	});

	it("creates a listing with description and metadata", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const row = await createListing(
			makeInput({
				slug: "described-listing",
				name: "Described",
				description: "A fine listing",
				metadata: { capacity: 10 },
			}),
			db
		);

		expect(row.description).toBe("A fine listing");
		expect(row.metadata).toEqual({ capacity: 10 });
	});

	it("creates a typed boat-rent profile for boat-rent listings", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const row = await createListing(
			makeInput({
				slug: "boat-rent-profile",
				serviceFamilyDetails: {
					boatRent: {
						capacity: 12,
						captainMode: "captain_optional",
						basePort: "Sochi Marine Station",
						departureArea: "Imeretinskaya Bay",
						fuelPolicy: "charged_by_usage",
						depositRequired: true,
						instantBookAllowed: false,
					},
				},
			}),
			db
		);

		const [profile] = await db
			.select()
			.from(listingBoatRentProfile)
			.where(eq(listingBoatRentProfile.listingId, row.id))
			.limit(1);

		expect(profile).toMatchObject({
			listingId: row.id,
			capacity: 12,
			captainMode: "captain_optional",
			basePort: "Sochi Marine Station",
			departureArea: "Imeretinskaya Bay",
			fuelPolicy: "charged_by_usage",
			depositRequired: true,
			instantBookAllowed: false,
		});
	});

	it("creates a typed excursion profile for excursion listings", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const row = await createListing(
			makeInput({
				slug: "excursion-profile",
				listingTypeSlug: EXCURSION_TYPE_SLUG,
				serviceFamilyDetails: {
					excursion: {
						meetingPoint: "Central fountain",
						durationMinutes: 180,
						groupFormat: "both",
						maxGroupSize: 12,
						primaryLanguage: "English",
						ticketsIncluded: true,
						childFriendly: true,
						instantBookAllowed: true,
					},
				},
			}),
			db
		);

		const [profile] = await db
			.select()
			.from(listingExcursionProfile)
			.where(eq(listingExcursionProfile.listingId, row.id))
			.limit(1);

		expect(profile).toMatchObject({
			listingId: row.id,
			meetingPoint: "Central fountain",
			durationMinutes: 180,
			groupFormat: "both",
			maxGroupSize: 12,
			primaryLanguage: "English",
			ticketsIncluded: true,
			childFriendly: true,
			instantBookAllowed: true,
		});
	});

	it("throws LISTING_TYPE_NOT_FOUND for an unknown listing type", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];

		await expect(
			createListing(
				makeInput({
					slug: "missing-type",
					listingTypeSlug: "missing-listing-type",
				}),
				db
			)
		).rejects.toThrow("LISTING_TYPE_NOT_FOUND");
	});

	it("throws LISTING_TYPE_INACTIVE for an inactive listing type", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const inactiveSlug = "inactive-listing-type";

		await db.insert(listingTypeConfig).values({
			id: inactiveSlug,
			slug: inactiveSlug,
			label: "Inactive Type",
			metadataJsonSchema: {},
			isActive: false,
			sortOrder: 1,
		});

		await expect(
			createListing(
				makeInput({
					slug: "inactive-type",
					listingTypeSlug: inactiveSlug,
				}),
				db
			)
		).rejects.toThrow("LISTING_TYPE_INACTIVE");
	});

	it("throws LISTING_TYPE_NOT_ENABLED when org-specific types are configured and slug is outside that set", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const otherTypeSlug = "other-listing-type";

		await db.insert(listingTypeConfig).values({
			id: otherTypeSlug,
			slug: otherTypeSlug,
			label: "Other Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 2,
		});

		await db.insert(organizationListingType).values({
			id: crypto.randomUUID(),
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
		});

		await expect(
			createListing(
				makeInput({
					slug: "org-disabled-type",
					listingTypeSlug: otherTypeSlug,
				}),
				db
			)
		).rejects.toThrow("LISTING_TYPE_NOT_ENABLED");
	});

	it("throws LISTING_SLUG_CONFLICT when the org already has the slug", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];

		await createListing(makeInput({ slug: "duplicate-slug" }), db);

		await expect(
			createListing(makeInput({ slug: "duplicate-slug" }), db)
		).rejects.toThrow("LISTING_SLUG_CONFLICT");
	});
});

describe("listAvailableListingTypes", () => {
	it("falls back to active platform listing types when the org has no overrides", async () => {
		const db = testDbState.db as unknown as Parameters<
			typeof listAvailableListingTypes
		>[1];
		const inactiveSlug = "platform-inactive-type";

		await db.insert(listingTypeConfig).values({
			id: inactiveSlug,
			slug: inactiveSlug,
			label: "Inactive Platform Type",
			metadataJsonSchema: {},
			isActive: false,
			sortOrder: 99,
		});

		const result = await listAvailableListingTypes(ORG_ID, db);

		expect(result.defaultValue).toBeNull();
		expect(result.items).toEqual(
			expect.arrayContaining([
				{
					defaultAmenityKeys: [],
					icon: null,
					isDefault: false,
					label: "Test Type",
					metadataJsonSchema: {},
					requiredFields: [],
					serviceFamily: "boat_rent",
					serviceFamilyPolicy: expect.objectContaining({
						key: "boat_rent",
						availabilityMode: "duration",
					}),
					supportedPricingModels: [],
					value: LISTING_TYPE_SLUG,
				},
				{
					defaultAmenityKeys: [],
					icon: null,
					isDefault: false,
					label: "Excursion Type",
					metadataJsonSchema: {},
					requiredFields: [],
					serviceFamily: "excursions",
					serviceFamilyPolicy: expect.objectContaining({
						key: "excursions",
						availabilityMode: "schedule",
					}),
					supportedPricingModels: [],
					value: EXCURSION_TYPE_SLUG,
				},
			])
		);
	});

	it("returns only active org-enabled listing types and exposes the default", async () => {
		const db = testDbState.db as unknown as Parameters<
			typeof listAvailableListingTypes
		>[1];
		const defaultSlug = "org-default-type";
		const extraSlug = "org-extra-type";
		const inactiveSlug = "org-inactive-type";

		await db.insert(listingTypeConfig).values([
			{
				id: defaultSlug,
				slug: defaultSlug,
				label: "Default Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 1,
			},
			{
				id: extraSlug,
				slug: extraSlug,
				label: "Extra Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 2,
			},
			{
				id: inactiveSlug,
				slug: inactiveSlug,
				label: "Inactive Type",
				metadataJsonSchema: {},
				isActive: false,
				sortOrder: 3,
			},
		]);

		await db.insert(organizationListingType).values([
			{
				id: crypto.randomUUID(),
				organizationId: ORG_ID,
				listingTypeSlug: defaultSlug,
				isDefault: true,
			},
			{
				id: crypto.randomUUID(),
				organizationId: ORG_ID,
				listingTypeSlug: extraSlug,
				isDefault: false,
			},
			{
				id: crypto.randomUUID(),
				organizationId: ORG_ID,
				listingTypeSlug: inactiveSlug,
				isDefault: false,
			},
		]);

		const result = await listAvailableListingTypes(ORG_ID, db);

		expect(result.defaultValue).toBe(defaultSlug);
		expect(result.items).toEqual([
			{
				defaultAmenityKeys: [],
				icon: null,
				isDefault: true,
				label: "Default Type",
				metadataJsonSchema: {},
				requiredFields: [],
				serviceFamily: "boat_rent",
				serviceFamilyPolicy: expect.objectContaining({
					key: "boat_rent",
					customerPresentation: expect.objectContaining({
						bookingMode: "request",
					}),
				}),
				supportedPricingModels: [],
				value: defaultSlug,
			},
			{
				defaultAmenityKeys: [],
				icon: null,
				isDefault: false,
				label: "Extra Type",
				metadataJsonSchema: {},
				requiredFields: [],
				serviceFamily: "boat_rent",
				serviceFamilyPolicy: expect.objectContaining({
					key: "boat_rent",
				}),
				supportedPricingModels: [],
				value: extraSlug,
			},
		]);
	});
});

describe("getCreateListingEditorState", () => {
	it("returns org defaults together with family-aware listing types", async () => {
		const db = testDbState.db as unknown as Parameters<
			typeof getCreateListingEditorState
		>[1];

		await db.insert(organizationSettings).values({
			id: crypto.randomUUID(),
			organizationId: ORG_ID,
			timezone: "Europe/Moscow",
		});

		await db.update(listingTypeConfig).set({
			requiredFields: ["name", "slug", "timezone"],
			supportedPricingModels: ["hourly", "package"],
			defaultAmenityKeys: ["captain"],
		});

		const result = await getCreateListingEditorState(ORG_ID, db);

		expect(result.defaults.timezone).toBe("Europe/Moscow");
		expect(result.listingTypes.items[0]).toMatchObject({
			value: LISTING_TYPE_SLUG,
			serviceFamily: "boat_rent",
			requiredFields: ["name", "slug", "timezone"],
			supportedPricingModels: ["hourly", "package"],
			defaultAmenityKeys: ["captain"],
			serviceFamilyPolicy: {
				profileEditor: expect.objectContaining({
					title: "Boat rent profile",
				}),
			},
		});
	});
});

describe("updateListing", () => {
	it("updates name and description", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(makeInput({ slug: "update-test" }), db);

		const updated = await updateListing(
			{
				id: created.id,
				organizationId: ORG_ID,
				name: "Updated Name",
				description: "Updated desc",
			},
			db
		);

		expect(updated.name).toBe("Updated Name");
		expect(updated.description).toBe("Updated desc");
	});

	it("updates typed boat-rent profile fields", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(
			makeInput({ slug: "boat-rent-update" }),
			db
		);

		await updateListing(
			{
				id: created.id,
				organizationId: ORG_ID,
				serviceFamilyDetails: {
					boatRent: {
						capacity: 14,
						basePort: "Novorossiysk Marina",
						departureArea: "Tsemess Bay",
						captainMode: "captained_only",
						fuelPolicy: "included",
						depositRequired: false,
						instantBookAllowed: true,
					},
				},
			},
			db
		);

		const [profile] = await db
			.select()
			.from(listingBoatRentProfile)
			.where(eq(listingBoatRentProfile.listingId, created.id))
			.limit(1);

		expect(profile).toMatchObject({
			capacity: 14,
			basePort: "Novorossiysk Marina",
			departureArea: "Tsemess Bay",
			instantBookAllowed: true,
		});
	});

	it("updates typed excursion profile fields", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(
			makeInput({
				slug: "excursion-update",
				listingTypeSlug: EXCURSION_TYPE_SLUG,
			}),
			db
		);

		await updateListing(
			{
				id: created.id,
				organizationId: ORG_ID,
				serviceFamilyDetails: {
					excursion: {
						meetingPoint: "Opera square",
						durationMinutes: 150,
						groupFormat: "private",
						maxGroupSize: 8,
						primaryLanguage: "Russian",
						ticketsIncluded: false,
						childFriendly: false,
						instantBookAllowed: false,
					},
				},
			},
			db
		);

		const [profile] = await db
			.select()
			.from(listingExcursionProfile)
			.where(eq(listingExcursionProfile.listingId, created.id))
			.limit(1);

		expect(profile).toMatchObject({
			meetingPoint: "Opera square",
			durationMinutes: 150,
			groupFormat: "private",
			maxGroupSize: 8,
			primaryLanguage: "Russian",
			instantBookAllowed: false,
		});
	});

	it("throws NOT_FOUND for wrong org", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(
			makeInput({ slug: "wrong-org-test" }),
			db
		);

		await expect(
			updateListing(
				{ id: created.id, organizationId: "wrong-org", name: "Fail" },
				db
			)
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listListings", () => {
	it("returns listings for the org sorted by createdAt desc", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		await createListing(makeInput({ slug: "list-test-a", name: "Alpha" }), db);
		await createListing(makeInput({ slug: "list-test-b", name: "Beta" }), db);

		const results = await listListings({ organizationId: ORG_ID }, db);

		expect(results.items.length).toBeGreaterThanOrEqual(2);
		expect(results.total).toBeGreaterThanOrEqual(2);
		const names = results.items.map((r) => r.name);
		expect(names).toContain("Alpha");
		expect(names).toContain("Beta");
	});

	it("applies search and sort to the listing collection", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		await createListing(makeInput({ slug: "sunset-cruise", name: "Sunset Cruise" }), db);
		await createListing(makeInput({ slug: "harbor-tour", name: "Harbor Tour" }), db);

		const results = await listListings(
			{
				organizationId: ORG_ID,
				search: "tour",
				sort: {
					by: "name",
					dir: "asc",
				},
			},
			db
		);

		expect(results.total).toBeGreaterThanOrEqual(1);
		expect(results.items.map((item) => item.name)).toEqual(["Harbor Tour"]);
	});
});

describe("getListing", () => {
	it("returns the listing by id and org", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(makeInput({ slug: "get-test" }), db);

		const found = await getListing(created.id, ORG_ID, db);
		expect(found.id).toBe(created.id);
	});

	it("throws NOT_FOUND when not found", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		await expect(getListing("nonexistent-id", ORG_ID, db)).rejects.toThrow(
			"NOT_FOUND"
		);
	});
});

describe("getListingWorkspaceState", () => {
	it("returns listing, type config, and publication state together", async () => {
		const db = testDbState.db as unknown as Parameters<
			typeof getListingWorkspaceState
		>[2];
		const created = await createListing(
			makeInput({ slug: "workspace-state" }),
			db
		);

		await publishListing(
			{
				listingId: created.id,
				organizationId: ORG_ID,
			},
			db
		);

		const state = await getListingWorkspaceState(created.id, ORG_ID, db);

		expect(state.listing.id).toBe(created.id);
		expect(state.listingType).toMatchObject({
			value: LISTING_TYPE_SLUG,
			serviceFamily: "boat_rent",
		});
		expect(state.boatRentProfile).toMatchObject({
			listingId: created.id,
			captainMode: "captained_only",
			fuelPolicy: "included",
			depositRequired: false,
			instantBookAllowed: false,
		});
		expect(state.publication).toEqual({
			activePublicationCount: 1,
			isPublished: true,
			requiresReview: true,
		});
		expect(state.excursionProfile).toBeNull();
	});

	it("returns excursion workspace state for excursion listings", async () => {
		const db = testDbState.db as unknown as Parameters<
			typeof getListingWorkspaceState
		>[2];
		const created = await createListing(
			makeInput({
				slug: "excursion-workspace-state",
				listingTypeSlug: EXCURSION_TYPE_SLUG,
				serviceFamilyDetails: {
					excursion: {
						meetingPoint: "Central fountain",
						durationMinutes: 180,
						groupFormat: "both",
						maxGroupSize: 12,
						primaryLanguage: "English",
						ticketsIncluded: true,
						childFriendly: true,
						instantBookAllowed: true,
					},
				},
			}),
			db
		);

		const state = await getListingWorkspaceState(created.id, ORG_ID, db);

		expect(state.listingType).toMatchObject({
			value: EXCURSION_TYPE_SLUG,
			serviceFamily: "excursions",
		});
		expect(state.boatRentProfile).toBeNull();
		expect(state.excursionProfile).toMatchObject({
			listingId: created.id,
			meetingPoint: "Central fountain",
			durationMinutes: 180,
			groupFormat: "both",
			maxGroupSize: 12,
			primaryLanguage: "English",
		});
		expect(state.serviceFamilyPolicy).toMatchObject({
			key: "excursions",
			availabilityMode: "schedule",
		});
	});
});

describe("publishListing", () => {
	it("sets status active and creates publication", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(
			makeInput({ slug: "publish-test" }),
			db
		);

		const { listing: updated, publication } = await publishListing(
			{ listingId: created.id, organizationId: ORG_ID },
			db
		);

		expect(updated.status).toBe("active");
		expect(updated.isActive).toBe(true);
		expect(publication.channelType).toBe("platform_marketplace");
		expect(publication.isActive).toBe(true);
	});

	it("is idempotent — second publish does not duplicate publication", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(
			makeInput({ slug: "publish-idempotent" }),
			db
		);

		await publishListing({ listingId: created.id, organizationId: ORG_ID }, db);
		await publishListing({ listingId: created.id, organizationId: ORG_ID }, db);

		const pubs = await db
			.select()
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.listingId, created.id),
					eq(listingPublication.channelType, "platform_marketplace")
				)
			);

		expect(pubs.length).toBe(1);
	});
});

describe("unpublishListing", () => {
	it("sets status inactive and marks publications inactive", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(
			makeInput({ slug: "unpublish-test" }),
			db
		);
		await publishListing({ listingId: created.id, organizationId: ORG_ID }, db);

		const result = await unpublishListing(created.id, ORG_ID, db);

		expect(result.status).toBe("inactive");
		expect(result.isActive).toBe(false);
	});
});
