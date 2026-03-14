import { organization } from "@my-app/db/schema/auth";
import {
	listingAvailabilityBlock,
	listingCalendarConnection,
	organizationCalendarAccount,
} from "@my-app/db/schema/availability";
import { listing, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearCalendarAdapterRegistry,
	disableCalendarConnection,
	enableCalendarConnection,
	FakeCalendarAdapter,
	registerCalendarAdapter,
} from "../index";

const ORG_ID = "calendar-lifecycle-org-1";
const LISTING_TYPE_SLUG = "calendar-lifecycle-type";
const LISTING_ID = "calendar-lifecycle-listing-1";
const ACCOUNT_ID = "calendar-lifecycle-account-1";
const CONNECTION_ID = "calendar-lifecycle-connection-1";
const CALENDAR_ID = "calendar-lifecycle-calendar-1";
const CALENDAR_BLOCK_ID = "calendar-block-1";
const MANUAL_BLOCK_ID = "manual-block-1";

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Calendar lifecycle type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});

		await db.insert(organization).values({
			id: ORG_ID,
			name: "Calendar Lifecycle Org",
			slug: "calendar-lifecycle-org",
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Calendar Lifecycle Listing",
			slug: "calendar-lifecycle-listing",
			timezone: "UTC",
		});

		await db.insert(organizationCalendarAccount).values({
			id: ACCOUNT_ID,
			organizationId: ORG_ID,
			provider: "google",
			externalAccountId: "fake-google-account-lifecycle",
			accountEmail: "fleet@example.com",
			displayName: "Fleet Google",
			status: "connected",
			providerMetadata: { credentials: {} },
		});

		await db.insert(listingCalendarConnection).values({
			id: CONNECTION_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			calendarAccountId: ACCOUNT_ID,
			provider: "google",
			externalCalendarId: CALENDAR_ID,
			watchChannelId: "watch-channel-1",
			watchResourceId: "watch-resource-1",
			watchExpiration: new Date("2030-03-13T00:00:00.000Z"),
			syncToken: "old-sync-token",
			isPrimary: true,
			isActive: true,
			syncStatus: "idle",
		});

		await db.insert(listingAvailabilityBlock).values([
			{
				id: CALENDAR_BLOCK_ID,
				listingId: LISTING_ID,
				calendarConnectionId: CONNECTION_ID,
				source: "calendar",
				externalRef: "external-event-1",
				startsAt: new Date("2030-03-15T10:00:00.000Z"),
				endsAt: new Date("2030-03-15T12:00:00.000Z"),
				reason: "Imported block",
				isActive: true,
			},
			{
				id: MANUAL_BLOCK_ID,
				listingId: LISTING_ID,
				source: "manual",
				startsAt: new Date("2030-03-16T10:00:00.000Z"),
				endsAt: new Date("2030-03-16T12:00:00.000Z"),
				reason: "Manual block",
				isActive: true,
			},
		]);
	},
});

beforeEach(() => {
	clearCalendarAdapterRegistry();
	registerCalendarAdapter("google", new FakeCalendarAdapter());
});

describe("calendar connection lifecycle", () => {
	it("disables the connection operationally and detaches imported calendar blocks", async () => {
		const row = await disableCalendarConnection(CONNECTION_ID, ORG_ID, dbState.db);

		expect(row.isActive).toBe(false);
		expect(row.syncStatus).toBe("disabled");
		expect(row.syncToken).toBeNull();
		expect(row.watchChannelId).toBeNull();
		expect(row.watchResourceId).toBeNull();
		expect(row.watchExpiration).toBeNull();

		const blocks = await dbState.db
			.select()
			.from(listingAvailabilityBlock)
			.where(eq(listingAvailabilityBlock.listingId, LISTING_ID));

		const importedBlock = blocks.find((block) => block.id === CALENDAR_BLOCK_ID);
		const manualBlock = blocks.find((block) => block.id === MANUAL_BLOCK_ID);

		expect(importedBlock?.isActive).toBe(false);
		expect(manualBlock?.isActive).toBe(true);
	});

	it("enables the connection and only re-ingests forward-looking calendar events", async () => {
		const adapter = new FakeCalendarAdapter();
		clearCalendarAdapterRegistry();
		registerCalendarAdapter("google", adapter);

		const now = new Date();
		const pastStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
		const pastEnd = new Date(now.getTime() - 60 * 60 * 1000);
		const futureStart = new Date(now.getTime() + 60 * 60 * 1000);
		const futureEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

		const pastEvent = await adapter.createEvent(
			{
				title: "Past external event",
				startsAt: pastStart,
				endsAt: pastEnd,
				timezone: "UTC",
			},
			{ provider: "google", credentials: {}, calendarId: CALENDAR_ID },
		);
		const futureEvent = await adapter.createEvent(
			{
				title: "Future external event",
				startsAt: futureStart,
				endsAt: futureEnd,
				timezone: "UTC",
			},
			{ provider: "google", credentials: {}, calendarId: CALENDAR_ID },
		);

		await disableCalendarConnection(CONNECTION_ID, ORG_ID, dbState.db);
		const row = await enableCalendarConnection(CONNECTION_ID, ORG_ID, dbState.db);

		expect(row.isActive).toBe(true);
		expect(row.syncStatus).toBe("idle");
		expect(row.syncToken).toContain("fake-sync-");

		const importedBlocks = await dbState.db
			.select()
			.from(listingAvailabilityBlock)
			.where(
				and(
					eq(listingAvailabilityBlock.calendarConnectionId, CONNECTION_ID),
					eq(listingAvailabilityBlock.source, "calendar"),
					eq(listingAvailabilityBlock.isActive, true),
				),
			);

		expect(importedBlocks.some((block) => block.externalRef === futureEvent.eventId)).toBe(
			true,
		);
		expect(importedBlocks.some((block) => block.externalRef === pastEvent.eventId)).toBe(
			false,
		);
	});
});
