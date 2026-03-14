import { organization } from "@my-app/db/schema/auth";
import {
	calendarIngressEvent,
	calendarWebhookEvent,
	listingCalendarConnection,
	organizationCalendarAccount,
} from "@my-app/db/schema/availability";
import { listing, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { clearCalendarAdapterRegistry, registerCalendarAdapter } from "../adapter-registry";
import { FakeCalendarAdapter } from "../fake-adapter";
import { getOrgCalendarObservability, ingestCalendarWebhook } from "../use-cases";

const ORG_ID = "calendar-observability-org-1";
const LISTING_TYPE_SLUG = "calendar-observability-type";
const LISTING_ID = "calendar-observability-listing-1";
const ACCOUNT_ID = "calendar-observability-account-1";
const CONNECTION_ID = "calendar-observability-connection-1";
const CALENDAR_ID = "calendar-observability-calendar-1";

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Calendar observability type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});

		await db.insert(organization).values({
			id: ORG_ID,
			name: "Calendar Observability Org",
			slug: "calendar-observability-org",
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Calendar Observability Listing",
			slug: "calendar-observability-listing",
			timezone: "UTC",
		});

		await db.insert(organizationCalendarAccount).values({
			id: ACCOUNT_ID,
			organizationId: ORG_ID,
			provider: "google",
			externalAccountId: "fake-google-account-obs-1",
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
			watchChannelId: "channel-observability-1",
			watchResourceId: "resource-observability-1",
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

describe("calendar observability", () => {
	it("records ingress events and exposes organization observability state", async () => {
		const outcome = await ingestCalendarWebhook(
			{
				provider: "google",
				headers: {
					"x-goog-channel-id": "channel-observability-1",
					"x-goog-resource-id": "resource-observability-1",
					"x-goog-resource-state": "exists",
					"x-goog-message-number": "5",
					"x-goog-channel-token": "shared-token",
				},
				request: {
					method: "POST",
					path: "/webhooks/calendar/google",
					host: "example.ngrok.app",
					remoteIp: "203.0.113.10",
					requestId: "req-calendar-1",
					traceId: "trace-calendar-1",
					userAgent: "Google-Webhook",
				},
				sharedToken: "shared-token",
			},
			dbState.db,
		);

		expect(outcome.kind).toBe("accepted");
		if (outcome.kind !== "accepted") {
			throw new Error(`Unexpected outcome: ${outcome.kind}`);
		}
		expect(outcome.matched).toBe(true);

		const [ingress] = await dbState.db
			.select()
			.from(calendarIngressEvent)
			.where(eq(calendarIngressEvent.calendarConnectionId, CONNECTION_ID))
			.limit(1);

		expect(ingress?.status).toBe("accepted");
		expect(ingress?.organizationId).toBe(ORG_ID);
		expect(ingress?.providerChannelId).toBe("channel-observability-1");
		expect(ingress?.messageNumber).toBe(5);
		expect(ingress?.responseCode).toBe(202);

		const [webhook] = await dbState.db
			.select()
			.from(calendarWebhookEvent)
			.where(eq(calendarWebhookEvent.calendarConnectionId, CONNECTION_ID))
			.limit(1);

		expect(webhook?.status).toBe("processed");

		const state = await getOrgCalendarObservability(
			{ organizationId: ORG_ID, limit: 10 },
			dbState.db,
		);

		expect(state.connections).toHaveLength(1);
		expect(state.ingressEvents).toHaveLength(1);
		expect(state.webhookEvents).toHaveLength(1);
		expect(state.ingressStatusCounts.accepted).toBe(1);
		expect(state.webhookStatusCounts.processed).toBe(1);
		expect(state.ingressEvents[0]?.listingName).toBe(
			"Calendar Observability Listing",
		);
	});
});
