import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { organization, user } from "../schema/auth";
import { booking, listing, listingTypeConfig } from "../schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "../test";
import {
	createListingFixture,
	createListingTypeConfigFixture,
	createOrganizationFixture,
	createUserFixture,
} from "../test/fixtures/factories";
import { seedMarketplaceBaselineScenario } from "../test/fixtures/scenarios/marketplace-baseline";

describe("Fixture factories", () => {
	const testDatabase = bootstrapTestDatabase({ seedStrategy: "beforeEach" });
	let db: TestDatabase;

	beforeEach(() => {
		db = testDatabase.db;
	});

	it("can compose a narrow listing setup without seeding the full baseline", async () => {
		await createOrganizationFixture(db, {
			id: "fixture_org_minimal",
			name: "Minimal Org",
			slug: "minimal-org",
		});

		await createUserFixture(db, {
			id: "fixture_user_minimal",
			name: "Minimal User",
			email: "minimal@example.com",
			emailVerified: true,
		});

		await createListingTypeConfigFixture(db, {
			id: "fixture_listing_type_basic",
			slug: "fixture_listing_type_basic",
			label: "Basic",
			metadataJsonSchema: { type: "object", properties: {} },
			isActive: true,
			sortOrder: 10,
		});

		const createdListing = await createListingFixture(db, {
			id: "fixture_listing_basic",
			organizationId: "fixture_org_minimal",
			listingTypeSlug: "fixture_listing_type_basic",
			name: "Minimal Listing",
			slug: "minimal-listing",
			timezone: "UTC",
			status: "draft",
			isActive: true,
		});

		const listingRows = await db
			.select()
			.from(listing)
			.where(eq(listing.id, createdListing.id));
		const bookingRows = await db.select().from(booking);

		expect(listingRows).toHaveLength(1);
		expect(listingRows[0]?.slug).toBe("minimal-listing");
		expect(bookingRows).toHaveLength(0);
	});

	it("can compose the full marketplace baseline scenario from factories", async () => {
		const scenario = await seedMarketplaceBaselineScenario(db);

		const [operatorOrganization] = await db
			.select()
			.from(organization)
			.where(eq(organization.id, scenario.ids.operatorOrgId));
		const [customerUser] = await db
			.select()
			.from(user)
			.where(eq(user.id, scenario.ids.customerUserId));
		const [baselineListingType] = await db
			.select()
			.from(listingTypeConfig)
			.where(eq(listingTypeConfig.id, scenario.ids.listingTypeSlug));
		const [baselineListing] = await db
			.select()
			.from(listing)
			.where(eq(listing.id, scenario.ids.listingId));
		const [baselineBooking] = await db
			.select()
			.from(booking)
			.where(eq(booking.id, scenario.ids.bookingId));

		expect(operatorOrganization?.slug).toBe("starter-org");
		expect(customerUser?.email).toBe("member@example.com");
		expect(baselineListingType?.slug).toBe("seed_listing_type_vessel");
		expect(baselineListing?.organizationId).toBe(scenario.ids.operatorOrgId);
		expect(baselineBooking?.publicationId).toBe(scenario.ids.publicationId);
	});
});
