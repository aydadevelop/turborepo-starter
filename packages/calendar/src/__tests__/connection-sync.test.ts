import { organization } from "@my-app/db/schema/auth";
import {
	calendarWebhookEvent,
	listingAvailabilityBlock,
	listingCalendarConnection,
	organizationCalendarAccount,
} from "@my-app/db/schema/availability";
import { listing, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { clearCalendarAdapterRegistry, registerCalendarAdapter } from "../adapter-registry";
import {
	startCalendarConnectionWatch,
	stopCalendarConnectionWatch,
	syncCalendarConnectionById,
	syncCalendarConnectionByWebhook,
} from "../connection-sync";
import { FakeCalendarAdapter } from "../fake-adapter";

const ORG_ID = "calendar-webhook-org-1";
const LISTING_TYPE_SLUG = "calendar-webhook-type";
const LISTING_ID = "calendar-webhook-listing-1";
const ACCOUNT_ID = "calendar-webhook-account-1";
const CONNECTION_ID = "calendar-webhook-connection-1";
const CALENDAR_ID = "calendar-webhook-calendar-1";

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Calendar webhook type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});

		await db.insert(organization).values({
			id: ORG_ID,
			name: "Calendar Webhook Org",
			slug: "calendar-webhook-org",
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Calendar Webhook Listing",
			slug: "calendar-webhook-listing",
			timezone: "UTC",
		});

		await db.insert(organizationCalendarAccount).values({
			id: ACCOUNT_ID,
			organizationId: ORG_ID,
			provider: "google",
			externalAccountId: "fake-google-account-1",
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
			watchChannelId: "channel-1",
			watchResourceId: "resource-1",
			isPrimary: true,
			isActive: true,
			syncStatus: "idle",
		});
	},
});

beforeEach(() => {
	clearCalendarAdapterRegistry();
	registerCalendarAdapter("google", new FakeCalendarAdapter());
});

describe("calendar connection sync", () => {
	it("imports external calendar events into listing availability blocks", async () => {
		const adapter = new FakeCalendarAdapter();
		clearCalendarAdapterRegistry();
		registerCalendarAdapter("google", adapter);

		const seededEvent = await adapter.createEvent(
			{
				title: "External maintenance",
				startsAt: new Date("2030-03-12T10:00:00.000Z"),
				endsAt: new Date("2030-03-12T12:00:00.000Z"),
				timezone: "UTC",
				description: "Imported from Google Calendar",
			},
			{
				provider: "google",
				credentials: {},
				calendarId: CALENDAR_ID,
			},
		);

		const result = await syncCalendarConnectionById(dbState.db, CONNECTION_ID);
		expect(result.processedEvents).toBe(1);

		const [block] = await dbState.db
			.select()
			.from(listingAvailabilityBlock)
			.where(eq(listingAvailabilityBlock.calendarConnectionId, CONNECTION_ID))
			.limit(1);

		expect(block?.externalRef).toBe(seededEvent.eventId);
		expect(block?.source).toBe("calendar");
		expect(block?.isActive).toBe(true);

		const [connection] = await dbState.db
			.select()
			.from(listingCalendarConnection)
			.where(eq(listingCalendarConnection.id, CONNECTION_ID))
			.limit(1);

		expect(connection?.lastSyncedAt).toBeInstanceOf(Date);
		expect(connection?.syncToken).toContain("fake-sync-");
	});

	it("deduplicates webhook deliveries by message number", async () => {
		const first = await syncCalendarConnectionByWebhook({
			db: dbState.db,
			provider: "google",
			notification: {
				channelId: "channel-1",
				resourceId: "resource-1",
				resourceState: "exists",
				messageNumber: 7,
			},
		});

		const second = await syncCalendarConnectionByWebhook({
			db: dbState.db,
			provider: "google",
			notification: {
				channelId: "channel-1",
				resourceId: "resource-1",
				resourceState: "exists",
				messageNumber: 7,
			},
		});

		expect(first.duplicate).toBe(false);
		expect(second.duplicate).toBe(true);

		const events = await dbState.db.select().from(calendarWebhookEvent);
		expect(events).toHaveLength(1);
		expect(events[0]?.providerChannelId).toBe("channel-1");
	});

	it("starts and stops watch channels on a connection", async () => {
		const started = await startCalendarConnectionWatch({
			db: dbState.db,
			connectionId: CONNECTION_ID,
			webhookUrl: "https://example.com/webhooks/calendar/google",
			channelToken: "shared-token",
			ttlSeconds: 3600,
		});

		expect(started.watch.channelId).toBeTruthy();
		expect(started.watch.resourceId).toBeTruthy();

		const [afterStart] = await dbState.db
			.select()
			.from(listingCalendarConnection)
			.where(eq(listingCalendarConnection.id, CONNECTION_ID))
			.limit(1);

		expect(afterStart?.watchChannelId).toBeTruthy();
		expect(afterStart?.watchResourceId).toBeTruthy();

		await stopCalendarConnectionWatch({
			db: dbState.db,
			connectionId: CONNECTION_ID,
		});

		const [afterStop] = await dbState.db
			.select()
			.from(listingCalendarConnection)
			.where(eq(listingCalendarConnection.id, CONNECTION_ID))
			.limit(1);

		expect(afterStop?.watchChannelId).toBeNull();
		expect(afterStop?.watchResourceId).toBeNull();
	});
});