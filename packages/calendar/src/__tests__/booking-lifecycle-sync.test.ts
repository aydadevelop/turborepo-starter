import { organization } from "@my-app/db/schema/auth";
import {
	bookingCalendarLink,
	listingCalendarConnection,
	organizationCalendarAccount,
} from "@my-app/db/schema/availability";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { clearEventPushers, emitDomainEvent } from "@my-app/events";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearCalendarAdapterRegistry,
	registerCalendarAdapter,
} from "../adapter-registry";
import { registerBookingLifecycleSync } from "../booking-lifecycle-sync";
import { FakeCalendarAdapter } from "../fake-adapter";

const ORG_ID = "cal-sync-org-1";
const LISTING_TYPE_SLUG = "cal-sync-type";
const LISTING_ID = "cal-sync-listing-1";
const PUBLICATION_ID = "cal-sync-publication-1";
const BOOKING_ID = "cal-sync-booking-1";
const CALENDAR_ACCOUNT_ID = "cal-sync-account-1";
const CALENDAR_CONNECTION_ID = "cal-sync-connection-1";
const CALENDAR_ID = "primary-fake-calendar";

beforeEach(() => {
	clearEventPushers();
	clearCalendarAdapterRegistry();
});

const dbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Calendar Sync Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Calendar Sync Org",
			slug: "calendar-sync-org",
		});
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Calendar Sync Listing",
			slug: "calendar-sync-listing",
			timezone: "UTC",
		});
		await db.insert(listingPublication).values({
			id: PUBLICATION_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
		});
		await db.insert(organizationCalendarAccount).values({
			id: CALENDAR_ACCOUNT_ID,
			organizationId: ORG_ID,
			provider: "google",
			externalAccountId: "fake-google-account-1",
			accountEmail: "fleet@example.com",
			displayName: "Fleet Google",
			status: "connected",
			providerMetadata: { credentials: {} },
		});
		await db.insert(listingCalendarConnection).values({
			id: CALENDAR_CONNECTION_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			calendarAccountId: CALENDAR_ACCOUNT_ID,
			provider: "google",
			externalCalendarId: CALENDAR_ID,
			isPrimary: true,
			isActive: true,
			syncStatus: "idle",
		});
		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUBLICATION_ID,
			merchantOrganizationId: ORG_ID,
			source: "manual",
			status: "confirmed",
			startsAt: new Date("2030-03-12T10:00:00.000Z"),
			endsAt: new Date("2030-03-12T12:00:00.000Z"),
			timezone: "UTC",
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
		});
	},
});

describe("registerBookingLifecycleSync", () => {
	it("updates provider events when a booking schedule changes", async () => {
		const fakeAdapter = new FakeCalendarAdapter();
		registerCalendarAdapter("google", fakeAdapter);

		const initialPresentation = await fakeAdapter.createEvent(
			{
				title: `Booking ${BOOKING_ID}`,
				startsAt: new Date("2030-03-12T10:00:00.000Z"),
				endsAt: new Date("2030-03-12T12:00:00.000Z"),
				timezone: "UTC",
				description: "Guest: Example",
				metadata: { bookingId: BOOKING_ID },
			},
			{
				provider: "google",
				credentials: {},
				calendarId: CALENDAR_ID,
			},
		);

		await dbState.db.insert(bookingCalendarLink).values({
			id: crypto.randomUUID(),
			bookingId: BOOKING_ID,
			calendarConnectionId: CALENDAR_CONNECTION_ID,
			provider: "google",
			providerEventId: initialPresentation.eventId,
			icalUid: initialPresentation.iCalUid,
			lastSyncedAt: initialPresentation.syncedAt,
		});

		registerBookingLifecycleSync(dbState.db);

		await dbState.db
			.update(booking)
			.set({
				startsAt: new Date("2030-03-12T13:00:00.000Z"),
				endsAt: new Date("2030-03-12T15:00:00.000Z"),
				updatedAt: new Date(),
			})
			.where(eq(booking.id, BOOKING_ID));

		await emitDomainEvent({
			type: "booking:schedule-updated",
			organizationId: ORG_ID,
			idempotencyKey: `booking:schedule-updated:${BOOKING_ID}:test`,
			data: {
				bookingId: BOOKING_ID,
				startsAt: "2030-03-12T13:00:00.000Z",
				endsAt: "2030-03-12T15:00:00.000Z",
				timezone: "UTC",
			},
		});

		const [updatedEvent] = fakeAdapter.getAllEvents(CALENDAR_ID);
		expect(updatedEvent?.input.startsAt.toISOString()).toBe(
			"2030-03-12T13:00:00.000Z",
		);
		expect(updatedEvent?.input.endsAt.toISOString()).toBe(
			"2030-03-12T15:00:00.000Z",
		);

		const [link] = await dbState.db
			.select()
			.from(bookingCalendarLink)
			.where(eq(bookingCalendarLink.bookingId, BOOKING_ID))
			.limit(1);
		expect(link?.lastSyncedAt).toBeTruthy();
	});
});
