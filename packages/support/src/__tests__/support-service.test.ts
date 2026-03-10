import { organization } from "@my-app/db/schema/auth";
import { booking, listing, listingPublication, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import {
	addTicketMessage,
	createSupportTicket,
	getTicket,
	listOrgTickets,
} from "../support-service";
import type { Db } from "../types";

const ORG_ID = "sup-org-1";
const OTHER_ORG_ID = "sup-org-2";
const BOOKING_ID = "sup-booking-1";
const LISTING_TYPE_SLUG = "sup-test-type";

const now = new Date();
const later = new Date(now.getTime() + 3_600_000);

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeAll",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Support Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values([
			{ id: ORG_ID, name: "Support Org One", slug: "sup-org-one" },
			{ id: OTHER_ORG_ID, name: "Support Org Two", slug: "sup-org-two" },
		]);
		await db.insert(listing).values({
			id: "sup-listing-1",
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Support Listing",
			slug: "sup-listing",
		});
		await db.insert(listingPublication).values({
			id: "sup-pub-1",
			listingId: "sup-listing-1",
			organizationId: ORG_ID,
			channelType: "own_site",
		});
		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: "sup-listing-1",
			publicationId: "sup-pub-1",
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "confirmed",
			startsAt: now,
			endsAt: later,
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
		});
	},
});

const getDb = () => testDbState.db as unknown as Db;

describe("createSupportTicket", () => {
	it("creates a ticket with status=open and returns the row", async () => {
		const ticket = await createSupportTicket(
			{
				organizationId: ORG_ID,
				bookingId: BOOKING_ID,
				subject: "My booking issue",
				description: "I need help",
			},
			getDb(),
		);

		expect(ticket.organizationId).toBe(ORG_ID);
		expect(ticket.bookingId).toBe(BOOKING_ID);
		expect(ticket.status).toBe("open");
		expect(ticket.priority).toBe("normal");
		expect(ticket.subject).toBe("My booking issue");
	});
});

describe("addTicketMessage", () => {
	it("throws NOT_FOUND when ticket belongs to a different org", async () => {
		// Create a ticket in ORG_ID
		const ticket = await createSupportTicket(
			{ organizationId: ORG_ID, subject: "Isolation test ticket" },
			getDb(),
		);

		// Try to add message from OTHER_ORG_ID — should throw
		await expect(() =>
			addTicketMessage(
				{
					ticketId: ticket.id,
					organizationId: OTHER_ORG_ID,
					body: "Unauthorized message attempt",
				},
				getDb(),
			),
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listOrgTickets", () => {
	it("filters by bookingId and returns only matching tickets", async () => {
		// Create two tickets — one linked to booking, one not
		await createSupportTicket(
			{ organizationId: ORG_ID, bookingId: BOOKING_ID, subject: "Booking ticket" },
			getDb(),
		);
		await createSupportTicket(
			{ organizationId: ORG_ID, subject: "General ticket" },
			getDb(),
		);

		const rows = await listOrgTickets(ORG_ID, { bookingId: BOOKING_ID }, getDb());

		expect(rows.length).toBeGreaterThanOrEqual(1);
		for (const row of rows) {
			expect(row.bookingId).toBe(BOOKING_ID);
		}
	});
});

describe("getTicket", () => {
	it("throws NOT_FOUND when ticket does not exist for org", async () => {
		await expect(() =>
			getTicket("nonexistent-ticket-id", ORG_ID, getDb()),
		).rejects.toThrow("NOT_FOUND");
	});
});
