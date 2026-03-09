import { organization } from "@my-app/db/schema/auth";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import {
	bootstrapTestDatabase,
	type TestDatabase,
} from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import {
	assertSlotAvailable,
	checkSlotAvailable,
	createAvailabilityBlock,
	createAvailabilityException,
	createAvailabilityRule,
	deleteAvailabilityBlock,
	deleteAvailabilityException,
	deleteAvailabilityRule,
	listAvailabilityRules,
} from "../availability-service";
import type { Db } from "../types";

const ORG_ID = "avail-org-1";
const OTHER_ORG_ID = "avail-org-2";
const LISTING_ID = "avail-listing-1";
const PUB_ID = "avail-pub-1";

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
		await db.insert(organization).values([
			{ id: ORG_ID, name: "Org One", slug: "org-one" },
			{ id: OTHER_ORG_ID, name: "Org Two", slug: "org-two" },
		]);
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: "test-type",
			name: "Test Listing",
			slug: "test-listing",
		});
		await db.insert(listingPublication).values({
			id: PUB_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
		});
	},
	seedStrategy: "beforeAll",
});

const getDb = () => testDbState.db as unknown as Db;

// ----- availability rules -----

describe("createAvailabilityRule", () => {
	it("creates a rule with correct fields", async () => {
		const rule = await createAvailabilityRule(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				dayOfWeek: 1,
				startMinute: 540,
				endMinute: 1020,
			},
			getDb(),
		);

		expect(rule.listingId).toBe(LISTING_ID);
		expect(rule.dayOfWeek).toBe(1);
		expect(rule.startMinute).toBe(540);
		expect(rule.endMinute).toBe(1020);
		expect(rule.isActive).toBe(true);
	});

	it("throws NOT_FOUND for wrong organization", async () => {
		await expect(
			createAvailabilityRule(
				{
					listingId: LISTING_ID,
					organizationId: OTHER_ORG_ID,
					dayOfWeek: 2,
					startMinute: 0,
					endMinute: 60,
				},
				getDb(),
			),
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listAvailabilityRules", () => {
	it("returns rules ordered by dayOfWeek then startMinute", async () => {
		const db = getDb();
		await createAvailabilityRule(
			{ listingId: LISTING_ID, organizationId: ORG_ID, dayOfWeek: 3, startMinute: 600, endMinute: 1080 },
			db,
		);
		await createAvailabilityRule(
			{ listingId: LISTING_ID, organizationId: ORG_ID, dayOfWeek: 2, startMinute: 480, endMinute: 960 },
			db,
		);

		const rules = await listAvailabilityRules(LISTING_ID, ORG_ID, db);
		expect(rules.length).toBeGreaterThanOrEqual(2);
		// Verify ordering: dayOfWeek ascending, then startMinute ascending
		for (let i = 1; i < rules.length; i++) {
			const prev = rules[i - 1]!;
			const curr = rules[i]!;
			expect(
				curr.dayOfWeek > prev.dayOfWeek ||
					(curr.dayOfWeek === prev.dayOfWeek && curr.startMinute >= prev.startMinute),
			).toBe(true);
		}
	});
});

describe("deleteAvailabilityRule", () => {
	it("deletes an existing rule", async () => {
		const db = getDb();
		const rule = await createAvailabilityRule(
			{ listingId: LISTING_ID, organizationId: ORG_ID, dayOfWeek: 5, startMinute: 0, endMinute: 120 },
			db,
		);
		await deleteAvailabilityRule(rule.id, ORG_ID, db);

		const remaining = await listAvailabilityRules(LISTING_ID, ORG_ID, db);
		expect(remaining.find((r) => r.id === rule.id)).toBeUndefined();
	});

	it("throws NOT_FOUND for unknown rule id", async () => {
		await expect(
			deleteAvailabilityRule("nonexistent-id", ORG_ID, getDb()),
		).rejects.toThrow("NOT_FOUND");
	});
});

// ----- availability blocks -----

describe("createAvailabilityBlock", () => {
	it("creates a block with source=manual", async () => {
		const startsAt = new Date("2025-09-01T09:00:00Z");
		const endsAt = new Date("2025-09-01T17:00:00Z");

		const block = await createAvailabilityBlock(
			{ listingId: LISTING_ID, organizationId: ORG_ID, startsAt, endsAt, reason: "Holiday" },
			getDb(),
		);

		expect(block.listingId).toBe(LISTING_ID);
		expect(block.source).toBe("manual");
		expect(block.isActive).toBe(true);
		expect(block.reason).toBe("Holiday");
	});
});

describe("deleteAvailabilityBlock", () => {
	it("deletes an existing block", async () => {
		const db = getDb();
		const block = await createAvailabilityBlock(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				startsAt: new Date("2025-10-01T00:00:00Z"),
				endsAt: new Date("2025-10-02T00:00:00Z"),
			},
			db,
		);
		await expect(deleteAvailabilityBlock(block.id, ORG_ID, db)).resolves.toBeUndefined();
	});
});

// ----- availability exceptions -----

describe("createAvailabilityException", () => {
	it("creates an exception marking a day unavailable", async () => {
		const exc = await createAvailabilityException(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				date: new Date("2025-12-25"),
				isAvailable: false,
				reason: "Christmas",
			},
			getDb(),
		);

		expect(exc.isAvailable).toBe(false);
		expect(exc.reason).toBe("Christmas");
	});

	it("throws DUPLICATE_DATE for the same listing+date", async () => {
		const db = getDb();
		await createAvailabilityException(
			{ listingId: LISTING_ID, organizationId: ORG_ID, date: new Date("2025-11-11"), isAvailable: false },
			db,
		);
		await expect(
			createAvailabilityException(
				{ listingId: LISTING_ID, organizationId: ORG_ID, date: new Date("2025-11-11"), isAvailable: true },
				db,
			),
		).rejects.toThrow("DUPLICATE_DATE");
	});
});

describe("deleteAvailabilityException", () => {
	it("deletes an existing exception", async () => {
		const db = getDb();
		const exc = await createAvailabilityException(
			{ listingId: LISTING_ID, organizationId: ORG_ID, date: new Date("2025-08-15"), isAvailable: false },
			db,
		);
		await expect(deleteAvailabilityException(exc.id, ORG_ID, db)).resolves.toBeUndefined();
	});
});

// ----- slot availability -----

describe("checkSlotAvailable", () => {
	it("returns true when no bookings or blocks overlap", async () => {
		const available = await checkSlotAvailable(
			LISTING_ID,
			new Date("2026-01-01T10:00:00Z"),
			new Date("2026-01-01T12:00:00Z"),
			getDb(),
		);
		expect(available).toBe(true);
	});

	it("returns false when a confirmed booking overlaps", async () => {
		const db = getDb();
		await db.insert(booking).values({
			id: crypto.randomUUID(),
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUB_ID,
			merchantOrganizationId: ORG_ID,
			source: "manual",
			status: "confirmed",
			startsAt: new Date("2026-02-01T09:00:00Z"),
			endsAt: new Date("2026-02-01T13:00:00Z"),
			basePriceCents: 10000,
			totalPriceCents: 10000,
			currency: "USD",
		});

		const available = await checkSlotAvailable(
			LISTING_ID,
			new Date("2026-02-01T11:00:00Z"),
			new Date("2026-02-01T15:00:00Z"),
			db,
		);
		expect(available).toBe(false);
	});

	it("returns true for a cancelled booking in the same slot", async () => {
		const db = getDb();
		await db.insert(booking).values({
			id: crypto.randomUUID(),
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUB_ID,
			merchantOrganizationId: ORG_ID,
			source: "manual",
			status: "cancelled",
			startsAt: new Date("2026-03-01T09:00:00Z"),
			endsAt: new Date("2026-03-01T12:00:00Z"),
			basePriceCents: 5000,
			totalPriceCents: 5000,
			currency: "USD",
		});

		const available = await checkSlotAvailable(
			LISTING_ID,
			new Date("2026-03-01T09:00:00Z"),
			new Date("2026-03-01T12:00:00Z"),
			db,
		);
		expect(available).toBe(true);
	});
});

describe("assertSlotAvailable", () => {
	it("does not throw when slot is free", async () => {
		await expect(
			assertSlotAvailable(
				LISTING_ID,
				new Date("2027-01-01T10:00:00Z"),
				new Date("2027-01-01T12:00:00Z"),
				getDb(),
			),
		).resolves.toBeUndefined();
	});

	it("throws SLOT_UNAVAILABLE when block covers the slot", async () => {
		const db = getDb();
		await createAvailabilityBlock(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				startsAt: new Date("2027-06-01T00:00:00Z"),
				endsAt: new Date("2027-06-02T00:00:00Z"),
			},
			db,
		);

		await expect(
			assertSlotAvailable(
				LISTING_ID,
				new Date("2027-06-01T10:00:00Z"),
				new Date("2027-06-01T12:00:00Z"),
				db,
			),
		).rejects.toThrow("SLOT_UNAVAILABLE");
	});
});
