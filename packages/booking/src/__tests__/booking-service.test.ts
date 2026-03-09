import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import { getOrgBooking, listCustomerBookings, listOrgBookings } from "../booking-service";
import type { Db } from "../types";

const ORG_ID = "bk-org-1";
const OTHER_ORG_ID = "bk-org-2";
const USER_1_ID = "bk-user-1";
const USER_2_ID = "bk-user-2";
const LISTING_1_ID = "bk-listing-1";
const LISTING_2_ID = "bk-listing-2";
const PUB_1_ID = "bk-pub-1";
const PUB_2_ID = "bk-pub-2";
const BK_1_ID = "bk-booking-1";
const BK_2_ID = "bk-booking-2";
const BK_3_ID = "bk-booking-3";

const now = new Date();
const later = new Date(now.getTime() + 3_600_000);

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: "bk-test-type",
			label: "BK Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values([
			{ id: ORG_ID, name: "Booking Org One", slug: "bk-org-one" },
			{ id: OTHER_ORG_ID, name: "Booking Org Two", slug: "bk-org-two" },
		]);
		await db.insert(user).values([
			{ id: USER_1_ID, name: "User One", email: "bk-user1@test.com", emailVerified: true },
			{ id: USER_2_ID, name: "User Two", email: "bk-user2@test.com", emailVerified: true },
		]);
		await db.insert(listing).values([
			{
				id: LISTING_1_ID,
				organizationId: ORG_ID,
				listingTypeSlug: "bk-test-type",
				name: "BK Listing One",
				slug: "bk-listing-one",
			},
			{
				id: LISTING_2_ID,
				organizationId: ORG_ID,
				listingTypeSlug: "bk-test-type",
				name: "BK Listing Two",
				slug: "bk-listing-two",
			},
		]);
		await db.insert(listingPublication).values([
			{
				id: PUB_1_ID,
				listingId: LISTING_1_ID,
				organizationId: ORG_ID,
				channelType: "own_site",
			},
			{
				id: PUB_2_ID,
				listingId: LISTING_2_ID,
				organizationId: ORG_ID,
				channelType: "own_site",
			},
		]);
		await db.insert(booking).values([
			// org-1, listing-1, user-1, pending
			{
				id: BK_1_ID,
				organizationId: ORG_ID,
				listingId: LISTING_1_ID,
				publicationId: PUB_1_ID,
				merchantOrganizationId: ORG_ID,
				customerUserId: USER_1_ID,
				source: "web",
				status: "pending",
				startsAt: now,
				endsAt: later,
				basePriceCents: 10_000,
				totalPriceCents: 10_000,
				currency: "RUB",
			},
			// org-1, listing-2, user-2, confirmed
			{
				id: BK_2_ID,
				organizationId: ORG_ID,
				listingId: LISTING_2_ID,
				publicationId: PUB_2_ID,
				merchantOrganizationId: ORG_ID,
				customerUserId: USER_2_ID,
				source: "manual",
				status: "confirmed",
				startsAt: now,
				endsAt: later,
				basePriceCents: 20_000,
				totalPriceCents: 20_000,
				currency: "RUB",
			},
			// org-2, listing-1, user-2 — isolation bookmark
			{
				id: BK_3_ID,
				organizationId: OTHER_ORG_ID,
				listingId: LISTING_1_ID,
				publicationId: PUB_1_ID,
				merchantOrganizationId: OTHER_ORG_ID,
				customerUserId: USER_2_ID,
				source: "web",
				status: "pending",
				startsAt: now,
				endsAt: later,
				basePriceCents: 5_000,
				totalPriceCents: 5_000,
				currency: "RUB",
			},
		]);
	},
	seedStrategy: "beforeAll",
});

const getDb = () => testDbState.db as unknown as Db;

// ----- listOrgBookings -----

describe("listOrgBookings", () => {
	it("returns all bookings for the org", async () => {
		const rows = await listOrgBookings(ORG_ID, {}, getDb());
		expect(rows).toHaveLength(2);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(BK_1_ID);
		expect(ids).toContain(BK_2_ID);
	});

	it("does not return bookings from another org", async () => {
		const rows = await listOrgBookings(ORG_ID, {}, getDb());
		expect(rows.map((r) => r.id)).not.toContain(BK_3_ID);
	});

	it("filters by status", async () => {
		const rows = await listOrgBookings(ORG_ID, { status: "pending" }, getDb());
		expect(rows).toHaveLength(1);
		expect(rows[0]!.id).toBe(BK_1_ID);
	});

	it("filters by listingId", async () => {
		const rows = await listOrgBookings(ORG_ID, { listingId: LISTING_1_ID }, getDb());
		expect(rows).toHaveLength(1);
		expect(rows[0]!.id).toBe(BK_1_ID);
	});

	it("returns empty array when no match", async () => {
		const rows = await listOrgBookings(ORG_ID, { listingId: "nonexistent" }, getDb());
		expect(rows).toHaveLength(0);
	});
});

// ----- getOrgBooking -----

describe("getOrgBooking", () => {
	it("returns the booking when org matches", async () => {
		const row = await getOrgBooking(BK_1_ID, ORG_ID, getDb());
		expect(row.id).toBe(BK_1_ID);
		expect(row.organizationId).toBe(ORG_ID);
		expect(row.status).toBe("pending");
	});

	it("throws NOT_FOUND when looking up with wrong org", async () => {
		await expect(getOrgBooking(BK_1_ID, OTHER_ORG_ID, getDb())).rejects.toThrow("NOT_FOUND");
	});

	it("throws NOT_FOUND for nonexistent booking id", async () => {
		await expect(getOrgBooking("nonexistent-id", ORG_ID, getDb())).rejects.toThrow("NOT_FOUND");
	});
});

// ----- listCustomerBookings -----

describe("listCustomerBookings", () => {
	it("returns only bookings belonging to the customer", async () => {
		const rows = await listCustomerBookings(USER_1_ID, getDb());
		expect(rows).toHaveLength(1);
		expect(rows[0]!.id).toBe(BK_1_ID);
		expect(rows[0]!.customerUserId).toBe(USER_1_ID);
	});

	it("does not return other customers' bookings", async () => {
		const rows = await listCustomerBookings(USER_1_ID, getDb());
		const ids = rows.map((r) => r.id);
		expect(ids).not.toContain(BK_2_ID);
		expect(ids).not.toContain(BK_3_ID);
	});

	it("returns bookings from multiple orgs for the same customer", async () => {
		// user-2 has bk-2 (org-1) and bk-3 (org-2)
		const rows = await listCustomerBookings(USER_2_ID, getDb());
		expect(rows).toHaveLength(2);
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(BK_2_ID);
		expect(ids).toContain(BK_3_ID);
	});
});
