import { organization, user } from "@my-app/db/schema/auth";
import { listingAvailabilityBlock } from "@my-app/db/schema/availability";
import { clearEventPushers, EventBus, registerEventPusher } from "@my-app/events";
import {
	booking,
	bookingDiscountApplication,
	bookingDiscountCode,
	listing,
	listingPricingProfile,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createBooking,
	getOrgBooking,
	listCustomerBookings,
	listOrgBookings,
	updateBookingSchedule,
	updateBookingStatus,
} from "../booking-service";
import type { Db } from "../types";

beforeEach(() => {
	clearEventPushers();
});

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
				contactName: "Alice Waters",
				contactEmail: "alice@example.com",
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
				contactName: "Bob Marina",
				contactEmail: "bob@example.com",
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
		const result = await listOrgBookings(ORG_ID, {}, getDb());
		expect(result.items).toHaveLength(2);
		expect(result.total).toBe(2);
		const ids = result.items.map((r) => r.id);
		expect(ids).toContain(BK_1_ID);
		expect(ids).toContain(BK_2_ID);
	});

	it("does not return bookings from another org", async () => {
		const result = await listOrgBookings(ORG_ID, {}, getDb());
		expect(result.items.map((r) => r.id)).not.toContain(BK_3_ID);
	});

	it("filters by status", async () => {
		const result = await listOrgBookings(
			ORG_ID,
			{ filter: { status: "pending" } },
			getDb(),
		);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.id).toBe(BK_1_ID);
	});

	it("filters by listingId", async () => {
		const result = await listOrgBookings(
			ORG_ID,
			{ filter: { listingId: LISTING_1_ID } },
			getDb(),
		);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.id).toBe(BK_1_ID);
	});

	it("returns empty array when no match", async () => {
		const result = await listOrgBookings(
			ORG_ID,
			{ filter: { listingId: "nonexistent" } },
			getDb(),
		);
		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	it("applies search and sort to the booking collection", async () => {
		const result = await listOrgBookings(
			ORG_ID,
			{
				search: "bob",
				sort: {
					by: "created_at",
					dir: "asc",
				},
			},
			getDb(),
		);

		expect(result.total).toBe(1);
		expect(result.items.map((row) => row.id)).toEqual([BK_2_ID]);
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

// ===== Plan 05-02: createBooking + updateBookingStatus TDD =====

const BK2_ORG_ID = "bk2-org-1";
const BK2_OTHER_ORG_ID = "bk2-org-2";
const BK2_LISTING_FREE_ID = "bk2-listing-free";
const BK2_LISTING_BLOCKED_ID = "bk2-listing-blocked";
const BK2_LISTING_NO_PRICING_ID = "bk2-listing-no-pricing";
const BK2_LISTING_MARKETLESS_ID = "bk2-listing-marketless";
const BK2_LISTING_MISMATCH_ID = "bk2-listing-mismatch";
const BK2_PUB_FREE_ID = "bk2-pub-free";
const BK2_PUB_BLOCKED_ID = "bk2-pub-blocked";
const BK2_PUB_NO_PRICING_ID = "bk2-pub-no-pricing";
const BK2_PUB_FREE_MARKET_ID = "bk2-pub-free-market";
const BK2_PUB_BLOCKED_MARKET_ID = "bk2-pub-blocked-market";
const BK2_PUB_NO_PRICING_MARKET_ID = "bk2-pub-no-pricing-market";
const BK2_PUB_MISMATCH_MARKET_ID = "bk2-pub-mismatch-market";
const BK2_PROFILE_ID = "bk2-pricing-profile-1";
const BK2_PROFILE_MARKETLESS_ID = "bk2-pricing-profile-marketless";
const BK2_PROFILE_MISMATCH_ID = "bk2-pricing-profile-mismatch";
const BK2_DISCOUNT_ID = "bk2-discount-1";

// Slot times far in the future — no overlap with seed bookings
const T_FREE_START = new Date("2030-01-15T10:00:00Z");
const T_FREE_END = new Date("2030-01-15T12:00:00Z");
const T_BLOCKED_START = new Date("2030-01-16T10:00:00Z");
const T_BLOCKED_END = new Date("2030-01-16T12:00:00Z");
const T_NO_PRICING_START = new Date("2030-01-17T10:00:00Z");
const T_NO_PRICING_END = new Date("2030-01-17T12:00:00Z");
const T_MARKETLESS_START = new Date("2030-01-18T10:00:00Z");
const T_MARKETLESS_END = new Date("2030-01-18T12:00:00Z");
const T_MISMATCH_START = new Date("2030-01-19T10:00:00Z");
const T_MISMATCH_END = new Date("2030-01-19T12:00:00Z");

// Past timestamps for updateBookingStatus seed bookings — no overlap with createBooking test slots
const SEED_SLOT_START = new Date("2025-06-01T10:00:00Z");
const SEED_SLOT_END = new Date("2025-06-01T12:00:00Z");

const BK2_PENDING_1_ID = "bk2-pending-1";
const BK2_CONFIRMED_1_ID = "bk2-confirmed-1";
const BK2_IN_PROGRESS_1_ID = "bk2-in-progress-1";
const BK2_COMPLETED_1_ID = "bk2-completed-1";
const BK2_CANCELLED_1_ID = "bk2-cancelled-1";
const BK2_REJECTED_1_ID = "bk2-rejected-1";

const testDbState2 = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: "bk2-test-type",
			label: "BK2 Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values([
			{ id: BK2_ORG_ID, name: "BK2 Org", slug: "bk2-org" },
			{ id: BK2_OTHER_ORG_ID, name: "BK2 Other Org", slug: "bk2-other-org" },
		]);
		await db.insert(user).values({
			id: USER_1_ID,
			name: "Discount Customer",
			email: "discount-customer@test.com",
			emailVerified: true,
		});
		await db.insert(listing).values([
			{
				id: BK2_LISTING_FREE_ID,
				organizationId: BK2_ORG_ID,
				listingTypeSlug: "bk2-test-type",
				name: "BK2 Free Listing",
				slug: "bk2-listing-free",
			},
			{
				id: BK2_LISTING_BLOCKED_ID,
				organizationId: BK2_ORG_ID,
				listingTypeSlug: "bk2-test-type",
				name: "BK2 Blocked Listing",
				slug: "bk2-listing-blocked",
			},
			{
				id: BK2_LISTING_NO_PRICING_ID,
				organizationId: BK2_ORG_ID,
				listingTypeSlug: "bk2-test-type",
				name: "BK2 No Pricing Listing",
				slug: "bk2-listing-no-pricing",
			},
			{
				id: BK2_LISTING_MARKETLESS_ID,
				organizationId: BK2_ORG_ID,
				listingTypeSlug: "bk2-test-type",
				name: "BK2 Marketless Listing",
				slug: "bk2-listing-marketless",
			},
			{
				id: BK2_LISTING_MISMATCH_ID,
				organizationId: BK2_ORG_ID,
				listingTypeSlug: "bk2-test-type",
				name: "BK2 Mismatch Listing",
				slug: "bk2-listing-mismatch",
			},
		]);
		await db.insert(listingPublication).values([
			{
				id: BK2_PUB_FREE_ID,
				listingId: BK2_LISTING_FREE_ID,
				organizationId: BK2_ORG_ID,
				channelType: "own_site",
			},
			{
				id: BK2_PUB_FREE_MARKET_ID,
				listingId: BK2_LISTING_FREE_ID,
				organizationId: BK2_ORG_ID,
				channelType: "platform_marketplace",
			},
			{
				id: BK2_PUB_BLOCKED_ID,
				listingId: BK2_LISTING_BLOCKED_ID,
				organizationId: BK2_ORG_ID,
				channelType: "own_site",
			},
			{
				id: BK2_PUB_BLOCKED_MARKET_ID,
				listingId: BK2_LISTING_BLOCKED_ID,
				organizationId: BK2_ORG_ID,
				channelType: "platform_marketplace",
			},
			{
				id: BK2_PUB_NO_PRICING_ID,
				listingId: BK2_LISTING_NO_PRICING_ID,
				organizationId: BK2_ORG_ID,
				channelType: "own_site",
			},
			{
				id: BK2_PUB_NO_PRICING_MARKET_ID,
				listingId: BK2_LISTING_NO_PRICING_ID,
				organizationId: BK2_ORG_ID,
				channelType: "platform_marketplace",
			},
			{
				id: BK2_PUB_MISMATCH_MARKET_ID,
				listingId: BK2_LISTING_MISMATCH_ID,
				organizationId: BK2_OTHER_ORG_ID,
				channelType: "platform_marketplace",
			},
		]);
		// Default pricing profile only for the free listing
		await db.insert(listingPricingProfile).values([
			{
				id: BK2_PROFILE_ID,
				listingId: BK2_LISTING_FREE_ID,
				name: "Default Profile",
				currency: "RUB",
				baseHourlyPriceCents: 6_000,
				isDefault: true,
			},
			{
				id: BK2_PROFILE_MARKETLESS_ID,
				listingId: BK2_LISTING_MARKETLESS_ID,
				name: "Marketless Profile",
				currency: "RUB",
				baseHourlyPriceCents: 6_000,
				isDefault: true,
			},
			{
				id: BK2_PROFILE_MISMATCH_ID,
				listingId: BK2_LISTING_MISMATCH_ID,
				name: "Mismatch Profile",
				currency: "RUB",
				baseHourlyPriceCents: 6_000,
				isDefault: true,
			},
		]);
		await db.insert(bookingDiscountCode).values({
			id: BK2_DISCOUNT_ID,
			organizationId: BK2_ORG_ID,
			appliesToListingId: BK2_LISTING_FREE_ID,
			code: "SAVE10",
			name: "Save ten",
			discountType: "percentage",
			discountValue: 10,
			minimumSubtotalCents: 0,
			isActive: true,
		});
		// Block the blocked listing's slot
		await db.insert(listingAvailabilityBlock).values({
			id: crypto.randomUUID(),
			listingId: BK2_LISTING_BLOCKED_ID,
			startsAt: T_BLOCKED_START,
			endsAt: T_BLOCKED_END,
			source: "manual",
			isActive: true,
		});
		// Seed bookings in various statuses for updateBookingStatus tests
		const bkBase = {
			organizationId: BK2_ORG_ID,
			listingId: BK2_LISTING_FREE_ID,
			publicationId: BK2_PUB_FREE_ID,
			merchantOrganizationId: BK2_ORG_ID,
			source: "manual" as const,
			startsAt: SEED_SLOT_START,
			endsAt: SEED_SLOT_END,
			basePriceCents: 12_000,
			totalPriceCents: 12_000,
			currency: "RUB",
		};
		await db.insert(booking).values([
			{ ...bkBase, id: BK2_PENDING_1_ID, status: "pending" },
			{ ...bkBase, id: BK2_CONFIRMED_1_ID, status: "confirmed" },
			{ ...bkBase, id: BK2_IN_PROGRESS_1_ID, status: "in_progress" },
			{ ...bkBase, id: BK2_COMPLETED_1_ID, status: "completed" },
			{ ...bkBase, id: BK2_CANCELLED_1_ID, status: "cancelled" },
			{ ...bkBase, id: BK2_REJECTED_1_ID, status: "rejected" },
		]);
	},
	seedStrategy: "beforeAll",
});

const getDb2 = () => testDbState2.db as unknown as Db;

// ----- createBooking -----

describe("createBooking", () => {
	it("resolves the active marketplace publication and organization from listingId", async () => {
		const row = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-01-14T10:00:00Z"),
				endsAt: new Date("2030-01-14T12:00:00Z"),
				source: "web",
				currency: "RUB",
			},
			getDb2(),
		);

		expect(row.organizationId).toBe(BK2_ORG_ID);
		expect(row.publicationId).toBe(BK2_PUB_FREE_MARKET_ID);
		expect(row.merchantOrganizationId).toBe(BK2_ORG_ID);
	});

	it("creates a booking for a free slot with pricing profile", async () => {
		const row = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: T_FREE_START,
				endsAt: T_FREE_END,
				source: "web",
				currency: "RUB",
			},
			getDb2(),
		);
		expect(row.status).toBe("pending");
		expect(row.paymentStatus).toBe("unpaid");
		expect(row.calendarSyncStatus).toBe("pending");
		expect(row.basePriceCents).toBeGreaterThan(0);
		expect(row.totalPriceCents).toBeGreaterThan(0);
		expect(row.organizationId).toBe(BK2_ORG_ID);
	});

	it("applies a discount code and records its usage", async () => {
		const row = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-01-20T10:00:00Z"),
				endsAt: new Date("2030-01-20T12:00:00Z"),
				source: "web",
				currency: "RUB",
				customerUserId: USER_1_ID,
				discountCode: "save10",
			},
			getDb2(),
		);

		expect(row.basePriceCents).toBe(12_000);
		expect(row.discountAmountCents).toBe(1_200);
		expect(row.totalPriceCents).toBe(10_800);

		const db = getDb2();
		const [application] = await db
			.select()
			.from(bookingDiscountApplication)
			.where(eq(bookingDiscountApplication.bookingId, row.id))
			.limit(1);
		expect(application).toMatchObject({
			discountCodeId: BK2_DISCOUNT_ID,
			customerUserId: USER_1_ID,
			code: "SAVE10",
			discountType: "percentage",
			discountValue: 10,
			appliedAmountCents: 1_200,
		});

		const [discountCode] = await db
			.select()
			.from(bookingDiscountCode)
			.where(eq(bookingDiscountCode.id, BK2_DISCOUNT_ID))
			.limit(1);
		expect(discountCode?.usageCount).toBe(1);
	});

	it("throws NOT_FOUND when the listing has no active marketplace publication", async () => {
		await expect(
			createBooking(
				{
					listingId: BK2_LISTING_MARKETLESS_ID,
					startsAt: T_MARKETLESS_START,
					endsAt: T_MARKETLESS_END,
					source: "web",
					currency: "RUB",
				},
				getDb2(),
			),
		).rejects.toThrow("NOT_FOUND");
	});

	it("throws PUBLICATION_ORG_MISMATCH when publication org differs from the listing org", async () => {
		await expect(
			createBooking(
				{
					listingId: BK2_LISTING_MISMATCH_ID,
					startsAt: T_MISMATCH_START,
					endsAt: T_MISMATCH_END,
					source: "web",
					currency: "RUB",
				},
				getDb2(),
			),
		).rejects.toThrow("PUBLICATION_ORG_MISMATCH");
	});

	it("throws SLOT_UNAVAILABLE when slot is blocked", async () => {
		await expect(
			createBooking(
				{
					listingId: BK2_LISTING_BLOCKED_ID,
					startsAt: T_BLOCKED_START,
					endsAt: T_BLOCKED_END,
					source: "web",
					currency: "RUB",
				},
				getDb2(),
			),
		).rejects.toThrow("SLOT_UNAVAILABLE");
	});

	it("throws NO_PRICING_PROFILE when listing has no default profile", async () => {
		await expect(
			createBooking(
				{
					listingId: BK2_LISTING_NO_PRICING_ID,
					startsAt: T_NO_PRICING_START,
					endsAt: T_NO_PRICING_END,
					source: "web",
					currency: "RUB",
				},
				getDb2(),
			),
		).rejects.toThrow("NO_PRICING_PROFILE");
	});
});

// ----- updateBookingStatus -----

describe("updateBookingStatus", () => {
	it("transitions pending → confirmed", async () => {
		const row = await updateBookingStatus(
			{ id: BK2_PENDING_1_ID, organizationId: BK2_ORG_ID, status: "confirmed" },
			getDb2(),
		);
		expect(row.status).toBe("confirmed");
	});

	it("emits booking:confirmed when workflow context is provided", async () => {
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-01T14:00:00Z"),
				endsAt: new Date("2030-02-01T16:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);
		const pusher = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher);

		await updateBookingStatus(
			{
				id: created.id,
				organizationId: BK2_ORG_ID,
				status: "confirmed",
				workflowContext: {
					organizationId: BK2_ORG_ID,
					actorUserId: "manager-1",
					idempotencyKey: `booking:confirmed:${created.id}`,
					eventBus: new EventBus(),
				},
			},
			getDb2(),
		);

		expect(pusher).toHaveBeenCalledWith(
			{
				type: "booking:confirmed",
				organizationId: BK2_ORG_ID,
				actorUserId: "manager-1",
				idempotencyKey: `booking:confirmed:${created.id}`,
				data: {
					bookingId: created.id,
					ownerId: BK2_ORG_ID,
				},
			},
			undefined,
		);
	});

	it("transitions pending → rejected", async () => {
		// Use a fresh pending booking to avoid state conflicts
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-01T10:00:00Z"),
				endsAt: new Date("2030-02-01T12:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);
		const row = await updateBookingStatus(
			{ id: created.id, organizationId: BK2_ORG_ID, status: "rejected" },
			getDb2(),
		);
		expect(row.status).toBe("rejected");
	});

	it("transitions pending → cancelled and sets cancelledAt", async () => {
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-02T10:00:00Z"),
				endsAt: new Date("2030-02-02T12:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);
		const row = await updateBookingStatus(
			{
				id: created.id,
				organizationId: BK2_ORG_ID,
				status: "cancelled",
				cancellationReason: "changed mind",
			},
			getDb2(),
		);
		expect(row.status).toBe("cancelled");
		expect(row.cancelledAt).toBeTruthy();
		expect(row.cancellationReason).toBe("changed mind");
	});

	it("emits booking:cancelled when workflow context is provided", async () => {
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-02T14:00:00Z"),
				endsAt: new Date("2030-02-02T16:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);
		const pusher = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher);

		await updateBookingStatus(
			{
				id: created.id,
				organizationId: BK2_ORG_ID,
				status: "cancelled",
				cancellationReason: "customer request",
				workflowContext: {
					organizationId: BK2_ORG_ID,
					actorUserId: "manager-2",
					idempotencyKey: `booking:cancelled:${created.id}`,
					eventBus: new EventBus(),
				},
			},
			getDb2(),
		);

		expect(pusher).toHaveBeenCalledWith(
			{
				type: "booking:cancelled",
				organizationId: BK2_ORG_ID,
				actorUserId: "manager-2",
				idempotencyKey: `booking:cancelled:${created.id}`,
				data: {
					bookingId: created.id,
					reason: "customer request",
					refundAmountKopeks: 0,
				},
			},
			undefined,
		);
	});

	it("transitions confirmed → in_progress", async () => {
		const row = await updateBookingStatus(
			{ id: BK2_CONFIRMED_1_ID, organizationId: BK2_ORG_ID, status: "in_progress" },
			getDb2(),
		);
		expect(row.status).toBe("in_progress");
	});

	it("transitions in_progress → completed", async () => {
		const row = await updateBookingStatus(
			{ id: BK2_IN_PROGRESS_1_ID, organizationId: BK2_ORG_ID, status: "completed" },
			getDb2(),
		);
		expect(row.status).toBe("completed");
	});

	it("throws INVALID_TRANSITION for pending → completed", async () => {
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-03T10:00:00Z"),
				endsAt: new Date("2030-02-03T12:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);
		await expect(
			updateBookingStatus(
				{ id: created.id, organizationId: BK2_ORG_ID, status: "completed" },
				getDb2(),
			),
		).rejects.toThrow("INVALID_TRANSITION");
	});

	it("throws INVALID_TRANSITION for terminal state (completed → confirmed)", async () => {
		await expect(
			updateBookingStatus(
				{ id: BK2_COMPLETED_1_ID, organizationId: BK2_ORG_ID, status: "confirmed" },
				getDb2(),
			),
		).rejects.toThrow("INVALID_TRANSITION");
	});

	it("throws NOT_FOUND for booking in wrong org", async () => {
		await expect(
			updateBookingStatus(
				{ id: BK2_PENDING_1_ID, organizationId: "wrong-org", status: "confirmed" },
				getDb2(),
			),
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("updateBookingSchedule", () => {
	it("updates the booking time window", async () => {
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-04T10:00:00Z"),
				endsAt: new Date("2030-02-04T12:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);

		const row = await updateBookingSchedule(
			{
				id: created.id,
				organizationId: BK2_ORG_ID,
				startsAt: new Date("2030-02-04T14:00:00Z"),
				endsAt: new Date("2030-02-04T16:00:00Z"),
				timezone: "Europe/Moscow",
			},
			getDb2(),
		);

		expect(row.startsAt.toISOString()).toBe("2030-02-04T14:00:00.000Z");
		expect(row.endsAt.toISOString()).toBe("2030-02-04T16:00:00.000Z");
		expect(row.timezone).toBe("Europe/Moscow");
	});

	it("rejects overlaps with blocking bookings", async () => {
		await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-05T10:30:00Z"),
				endsAt: new Date("2030-02-05T11:30:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);

		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-05T08:00:00Z"),
				endsAt: new Date("2030-02-05T10:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);

		await expect(
			updateBookingSchedule(
				{
					id: created.id,
					organizationId: BK2_ORG_ID,
					startsAt: new Date("2030-02-05T10:30:00Z"),
					endsAt: new Date("2030-02-05T11:30:00Z"),
				},
				getDb2(),
			),
		).rejects.toThrow("BOOKING_OVERLAP");
	});

	it("emits booking:schedule-updated when workflow context is provided", async () => {
		const created = await createBooking(
			{
				listingId: BK2_LISTING_FREE_ID,
				startsAt: new Date("2030-02-06T10:00:00Z"),
				endsAt: new Date("2030-02-06T12:00:00Z"),
				source: "manual",
				currency: "RUB",
			},
			getDb2(),
		);
		const pusher = vi.fn().mockResolvedValue(undefined);
		registerEventPusher(pusher);

		const row = await updateBookingSchedule(
			{
				id: created.id,
				organizationId: BK2_ORG_ID,
				startsAt: new Date("2030-02-06T13:00:00Z"),
				endsAt: new Date("2030-02-06T15:00:00Z"),
				timezone: "UTC",
				workflowContext: {
					organizationId: BK2_ORG_ID,
					actorUserId: "manager-3",
					idempotencyKey: `booking:schedule-updated:${created.id}`,
					eventBus: new EventBus(),
				},
			},
			getDb2(),
		);

		expect(pusher).toHaveBeenCalledWith(
			{
				type: "booking:schedule-updated",
				organizationId: BK2_ORG_ID,
				actorUserId: "manager-3",
				idempotencyKey: `booking:schedule-updated:${created.id}:${row.updatedAt.toISOString()}`,
				data: {
					bookingId: created.id,
					startsAt: "2030-02-06T13:00:00.000Z",
					endsAt: "2030-02-06T15:00:00.000Z",
					timezone: "UTC",
				},
			},
			undefined,
		);
	});
});
