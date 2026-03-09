import { organization } from "@my-app/db/schema/auth";
import {
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import {
	bootstrapTestDatabase,
	type TestDatabase,
} from "@my-app/db/test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
	createListing,
	getListing,
	listListings,
	updateListing,
} from "../listing-service";
import { publishListing, unpublishListing } from "../publication-service";

const ORG_ID = "test-org-1";
const LISTING_TYPE_SLUG = "test-listing-type";

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db
			.insert(listingTypeConfig)
			.values({
				id: crypto.randomUUID(),
				slug: LISTING_TYPE_SLUG,
				label: "Test Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 0,
			});
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Test Org",
			slug: "test-org",
		});
	},
	seedStrategy: "beforeAll",
});

const makeInput = (overrides?: Partial<Parameters<typeof createListing>[0]>) => ({
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
			db,
		);

		expect(row.description).toBe("A fine listing");
		expect(row.metadata).toEqual({ capacity: 10 });
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
			db,
		);

		expect(updated.name).toBe("Updated Name");
		expect(updated.description).toBe("Updated desc");
	});

	it("throws NOT_FOUND for wrong org", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(makeInput({ slug: "wrong-org-test" }), db);

		await expect(
			updateListing(
				{ id: created.id, organizationId: "wrong-org", name: "Fail" },
				db,
			),
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listListings", () => {
	it("returns listings for the org sorted by createdAt desc", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		await createListing(makeInput({ slug: "list-test-a", name: "Alpha" }), db);
		await createListing(makeInput({ slug: "list-test-b", name: "Beta" }), db);

		const results = await listListings({ organizationId: ORG_ID }, db);

		expect(results.length).toBeGreaterThanOrEqual(2);
		const names = results.map((r) => r.name);
		expect(names).toContain("Alpha");
		expect(names).toContain("Beta");
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
			"NOT_FOUND",
		);
	});
});

describe("publishListing", () => {
	it("sets status active and creates publication", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(makeInput({ slug: "publish-test" }), db);

		const { listing: updated, publication } = await publishListing(
			{ listingId: created.id, organizationId: ORG_ID },
			db,
		);

		expect(updated.status).toBe("active");
		expect(updated.isActive).toBe(true);
		expect(publication.channelType).toBe("platform_marketplace");
		expect(publication.isActive).toBe(true);
	});

	it("is idempotent — second publish does not duplicate publication", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(makeInput({ slug: "publish-idempotent" }), db);

		await publishListing({ listingId: created.id, organizationId: ORG_ID }, db);
		await publishListing({ listingId: created.id, organizationId: ORG_ID }, db);

		const pubs = await db
			.select()
			.from(listingPublication)
			.where(
				and(
					eq(listingPublication.listingId, created.id),
					eq(listingPublication.channelType, "platform_marketplace"),
				),
			);

		expect(pubs.length).toBe(1);
	});
});

describe("unpublishListing", () => {
	it("sets status inactive and marks publications inactive", async () => {
		const db = testDbState.db as unknown as Parameters<typeof createListing>[1];
		const created = await createListing(makeInput({ slug: "unpublish-test" }), db);
		await publishListing({ listingId: created.id, organizationId: ORG_ID }, db);

		const result = await unpublishListing(created.id, ORG_ID, db);

		expect(result.status).toBe("inactive");
		expect(result.isActive).toBe(false);
	});
});
