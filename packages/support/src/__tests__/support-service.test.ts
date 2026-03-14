import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import {
	addTicketMessage,
	createSupportTicket,
	getCustomerTicket,
	getTicket,
	listCustomerTickets,
	listOrgTickets,
	listTicketMessages,
} from "..";
import type { Db } from "../shared/types";

const ORG_ID = "sup-org-1";
const OTHER_ORG_ID = "sup-org-2";
const BOOKING_ID = "sup-booking-1";
const LISTING_TYPE_SLUG = "sup-test-type";
const CUSTOMER_USER_ID = "sup-customer-1";
const OTHER_CUSTOMER_USER_ID = "sup-customer-2";

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
		await db.insert(user).values([
			{
				id: CUSTOMER_USER_ID,
				name: "Customer One",
				email: "customer-1@test.com",
				emailVerified: true,
			},
			{
				id: OTHER_CUSTOMER_USER_ID,
				name: "Customer Two",
				email: "customer-2@test.com",
				emailVerified: true,
			},
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
			customerUserId: CUSTOMER_USER_ID,
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
			getDb()
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
			getDb()
		);

		// Try to add message from OTHER_ORG_ID — should throw
		await expect(
			addTicketMessage(
				{
					ticketId: ticket.id,
					organizationId: OTHER_ORG_ID,
					body: "Unauthorized message attempt",
				},
				getDb()
			)
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listOrgTickets", () => {
	it("filters by bookingId and returns only matching tickets", async () => {
		// Create two tickets — one linked to booking, one not
		await createSupportTicket(
			{
				organizationId: ORG_ID,
				bookingId: BOOKING_ID,
				subject: "Booking ticket",
			},
			getDb()
		);
		await createSupportTicket(
			{ organizationId: ORG_ID, subject: "General ticket" },
			getDb()
		);

		const result = await listOrgTickets(
			ORG_ID,
			{ filter: { bookingId: BOOKING_ID } },
			getDb()
		);

		expect(result.items.length).toBeGreaterThanOrEqual(1);
		for (const row of result.items) {
			expect(row.bookingId).toBe(BOOKING_ID);
		}
	});

	it("applies search and sort to organization tickets", async () => {
		await createSupportTicket(
			{
				organizationId: ORG_ID,
				subject: "Harbor pickup issue",
				priority: "urgent",
			},
			getDb()
		);
		await createSupportTicket(
			{
				organizationId: ORG_ID,
				subject: "Cabin photo request",
				priority: "low",
			},
			getDb()
		);

		const result = await listOrgTickets(
			ORG_ID,
			{
				search: "pickup",
				sort: {
					by: "priority",
					dir: "desc",
				},
			},
			getDb()
		);

		expect(result.total).toBe(1);
		expect(result.items.map((row) => row.subject)).toEqual([
			"Harbor pickup issue",
		]);
	});
});

describe("getTicket", () => {
	it("throws NOT_FOUND when ticket does not exist for org", async () => {
		await expect(
			getTicket("nonexistent-ticket-id", ORG_ID, getDb())
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listCustomerTickets", () => {
	it("returns only tickets where customerUserId matches", async () => {
		const ticket = await createSupportTicket(
			{
				organizationId: ORG_ID,
				bookingId: BOOKING_ID,
				subject: "Customer ticket",
				customerUserId: CUSTOMER_USER_ID,
			},
			getDb()
		);
		await createSupportTicket(
			{
				organizationId: ORG_ID,
				subject: "Other customer ticket",
				customerUserId: OTHER_CUSTOMER_USER_ID,
			},
			getDb()
		);

		const result = await listCustomerTickets(CUSTOMER_USER_ID, {}, getDb());

		expect(result.items.length).toBeGreaterThanOrEqual(1);
		const found = result.items.find((r) => r.id === ticket.id);
		expect(found).toBeDefined();
		for (const row of result.items) {
			expect(row.customerUserId).toBe(CUSTOMER_USER_ID);
		}
	});

	it("does not return tickets belonging to other customers", async () => {
		const result = await listCustomerTickets(
			OTHER_CUSTOMER_USER_ID,
			{},
			getDb()
		);

		for (const row of result.items) {
			expect(row.customerUserId).toBe(OTHER_CUSTOMER_USER_ID);
		}
	});

	it("filters by bookingId when provided", async () => {
		await createSupportTicket(
			{
				organizationId: ORG_ID,
				bookingId: BOOKING_ID,
				subject: "Booking-scoped ticket",
				customerUserId: CUSTOMER_USER_ID,
			},
			getDb()
		);

		const result = await listCustomerTickets(
			CUSTOMER_USER_ID,
			{ filter: { bookingId: BOOKING_ID } },
			getDb()
		);

		expect(result.items.length).toBeGreaterThanOrEqual(1);
		for (const row of result.items) {
			expect(row.bookingId).toBe(BOOKING_ID);
		}
	});
});

describe("getCustomerTicket", () => {
	it("returns the ticket when customerUserId matches", async () => {
		const ticket = await createSupportTicket(
			{
				organizationId: ORG_ID,
				subject: "My own ticket",
				customerUserId: CUSTOMER_USER_ID,
			},
			getDb()
		);

		const row = await getCustomerTicket(ticket.id, CUSTOMER_USER_ID, getDb());
		expect(row.id).toBe(ticket.id);
		expect(row.customerUserId).toBe(CUSTOMER_USER_ID);
	});

	it("throws NOT_FOUND when customerUserId does not match", async () => {
		const ticket = await createSupportTicket(
			{
				organizationId: ORG_ID,
				subject: "Someone else's ticket",
				customerUserId: CUSTOMER_USER_ID,
			},
			getDb()
		);

		await expect(
			getCustomerTicket(ticket.id, OTHER_CUSTOMER_USER_ID, getDb())
		).rejects.toThrow("NOT_FOUND");
	});
});

describe("listTicketMessages", () => {
	it("returns only non-internal messages for a ticket", async () => {
		const ticket = await createSupportTicket(
			{ organizationId: ORG_ID, subject: "Messages test ticket" },
			getDb()
		);

		await addTicketMessage(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				body: "Public reply",
				isInternal: false,
			},
			getDb()
		);
		await addTicketMessage(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				body: "Internal note",
				isInternal: true,
			},
			getDb()
		);

		const messages = await listTicketMessages(ticket.id, getDb());

		expect(messages.length).toBeGreaterThanOrEqual(1);
		for (const msg of messages) {
			expect(msg.isInternal).toBe(false);
		}
	});
});
