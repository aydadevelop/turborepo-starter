const dbModuleState = vi.hoisted(() => ({
	current: undefined as unknown,
}));

vi.mock("@my-app/db", () => ({
	get db() {
		if (!dbModuleState.current) {
			throw new Error("Test DB not initialized");
		}

		return dbModuleState.current;
	},
}));

import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { supportTicket, supportTicketMessage } from "@my-app/db/schema/support";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { RPCHandler } from "@orpc/server/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import { appRouter } from "../handlers/index";

const ORG_ID = "api-support-org-1";
const USER_ID = "api-support-user-1";
const ASSIGNEE_USER_ID = "api-support-assignee-1";
const CUSTOMER_USER_ID = "api-support-customer-1";
const LISTING_TYPE_ID = "api-support-listing-type-1";
const LISTING_ID = "api-support-listing-1";
const BOOKING_ID = "api-support-booking-1";
const NOW = new Date("2026-03-11T12:00:00.000Z");

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "API Support Org",
			slug: "api-support-org",
			createdAt: NOW,
		});

		await db.insert(user).values([
			{
				id: USER_ID,
				name: "Support Owner",
				email: "api-support-owner@example.com",
				emailVerified: true,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: ASSIGNEE_USER_ID,
				name: "Support Assignee",
				email: "api-support-assignee@example.com",
				emailVerified: true,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: CUSTOMER_USER_ID,
				name: "Support Customer",
				email: "api-support-customer@example.com",
				emailVerified: true,
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);

		await db.insert(listingTypeConfig).values({
			id: LISTING_TYPE_ID,
			slug: LISTING_TYPE_ID,
			label: "Boat",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_ID,
			name: "Support Listing",
			slug: "support-listing",
			status: "active",
			isActive: true,
			timezone: "UTC",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingPublication).values({
			id: "api-support-publication-1",
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
			isActive: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: "api-support-publication-1",
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "confirmed",
			startsAt: NOW,
			endsAt: new Date("2026-03-11T13:00:00.000Z"),
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
			customerUserId: CUSTOMER_USER_ID,
			createdAt: NOW,
			updatedAt: NOW,
		});
	},
});

const getDb = () => {
	const db = dbState.db;
	dbModuleState.current = db;
	return db;
};

const rpcHandler = new RPCHandler(appRouter);

const createRpcContext = (overrides: Partial<Context> = {}): Context => ({
	activeMembership: {
		organizationId: ORG_ID,
		role: "org_owner",
	},
	notificationQueue: {
		send: vi.fn().mockResolvedValue(undefined),
	},
	requestCookies: {},
	requestHostname: "example.test",
	requestUrl: "http://example.test/rpc/support/getTicket",
	session: {
		session: {
			id: "session-1",
			createdAt: NOW,
			updatedAt: NOW,
			userId: USER_ID,
			expiresAt: new Date("2026-03-12T12:00:00.000Z"),
			token: "session-token",
			activeOrganizationId: ORG_ID,
		},
		user: {
			id: USER_ID,
			email: "api-support-owner@example.com",
		},
	} as unknown as Context["session"],
	...overrides,
});

const callRpc = async (
	path: string,
	json: unknown,
	contextOverrides: Partial<Context> = {}
): Promise<{ status: number; body: unknown }> => {
	const request = new Request(`http://example.test${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ json }),
	});

	const result = await rpcHandler.handle(request, {
		prefix: "/rpc",
		context: createRpcContext(contextOverrides),
	});

	if (!(result.matched && result.response)) {
		throw new Error(`RPC request did not match ${path}`);
	}

	const rawBody = (await result.response.json()) as { json: unknown };
	return {
		status: result.response.status,
		body: rawBody.json,
	};
};

describe("support routes", () => {
	beforeEach(() => {
		getDb();
	});

	it("requires support:update for operator lifecycle routes", async () => {
		await getDb().insert(supportTicket).values({
			id: "ticket-update-1",
			organizationId: ORG_ID,
			customerUserId: CUSTOMER_USER_ID,
			subject: "Need assignment",
			source: "web",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await callRpc(
			"/rpc/support/assignTicket",
			{
				ticketId: "ticket-update-1",
				assignedToUserId: ASSIGNEE_USER_ID,
			},
			{
				activeMembership: {
					organizationId: ORG_ID,
					role: "member",
				},
			}
		);

		expect(result.status).toBe(403);
	});

	it("applies listOrgTickets operator filters", async () => {
		await getDb()
			.insert(supportTicket)
			.values([
				{
					id: "ticket-filter-1",
					organizationId: ORG_ID,
					customerUserId: CUSTOMER_USER_ID,
					subject: "Overdue web ticket",
					source: "web",
					priority: "high",
					status: "open",
					dueAt: new Date("2026-03-10T10:00:00.000Z"),
					createdAt: NOW,
					updatedAt: NOW,
				},
				{
					id: "ticket-filter-2",
					organizationId: ORG_ID,
					customerUserId: CUSTOMER_USER_ID,
					subject: "Assigned email ticket",
					source: "email",
					priority: "normal",
					status: "pending_customer",
					assignedToUserId: ASSIGNEE_USER_ID,
					dueAt: new Date("2026-03-12T10:00:00.000Z"),
					createdAt: NOW,
					updatedAt: NOW,
				},
			]);

		const result = await callRpc("/rpc/support/listOrgTickets", {
			filter: {
				priority: "high",
				source: "web",
				customerUserId: CUSTOMER_USER_ID,
				onlyUnassigned: true,
				onlyOverdue: true,
			},
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			items: [
				{
					id: "ticket-filter-1",
					priority: "high",
					source: "web",
				},
			],
			page: {
				total: 1,
			},
		});
	});

	it("returns operator-visible thread data and updates ticket lifecycle fields", async () => {
		await getDb().insert(supportTicket).values({
			id: "ticket-thread-1",
			organizationId: ORG_ID,
			customerUserId: CUSTOMER_USER_ID,
			subject: "Thread ticket",
			source: "web",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await getDb()
			.insert(supportTicketMessage)
			.values([
				{
					id: "ticket-thread-msg-1",
					ticketId: "ticket-thread-1",
					organizationId: ORG_ID,
					authorUserId: USER_ID,
					channel: "internal",
					body: "Internal note",
					isInternal: true,
					createdAt: NOW,
					updatedAt: NOW,
				},
				{
					id: "ticket-thread-msg-2",
					ticketId: "ticket-thread-1",
					organizationId: ORG_ID,
					authorUserId: USER_ID,
					channel: "web",
					body: "Customer-facing reply",
					isInternal: false,
					createdAt: NOW,
					updatedAt: NOW,
				},
			]);

		const thread = await callRpc("/rpc/support/getTicketThread", {
			ticketId: "ticket-thread-1",
		});
		expect(thread.status).toBe(200);
		expect(thread.body).toMatchObject({
			ticket: {
				id: "ticket-thread-1",
				assignedToUserId: null,
			},
			messages: [
				{ id: "ticket-thread-msg-1", isInternal: true },
				{ id: "ticket-thread-msg-2", isInternal: false },
			],
		});

		const assigned = await callRpc("/rpc/support/assignTicket", {
			ticketId: "ticket-thread-1",
			assignedToUserId: ASSIGNEE_USER_ID,
		});
		expect(assigned.status).toBe(200);
		expect(assigned.body).toMatchObject({
			assignedToUserId: ASSIGNEE_USER_ID,
		});

		const reprioritized = await callRpc("/rpc/support/updateTicketPriority", {
			ticketId: "ticket-thread-1",
			priority: "urgent",
		});
		expect(reprioritized.body).toMatchObject({ priority: "urgent" });

		const dueUpdated = await callRpc("/rpc/support/updateTicketDueAt", {
			ticketId: "ticket-thread-1",
			dueAt: "2026-03-12T10:00:00.000Z",
		});
		expect(dueUpdated.body).toMatchObject({
			dueAt: "2026-03-12T10:00:00.000Z",
		});

		const resolved = await callRpc("/rpc/support/updateTicketStatus", {
			ticketId: "ticket-thread-1",
			status: "resolved",
		});
		expect(resolved.body).toMatchObject({
			status: "resolved",
			resolvedByUserId: USER_ID,
		});
		expect(
			(resolved.body as { resolvedAt: string | null }).resolvedAt
		).not.toBeNull();
	});

	it("keeps customer routes customer-safe and hides internal notes", async () => {
		await getDb().insert(supportTicket).values({
			id: "ticket-customer-1",
			organizationId: ORG_ID,
			customerUserId: CUSTOMER_USER_ID,
			subject: "Customer-safe ticket",
			source: "web",
			status: "pending_customer",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await getDb()
			.insert(supportTicketMessage)
			.values([
				{
					id: "ticket-customer-msg-1",
					ticketId: "ticket-customer-1",
					organizationId: ORG_ID,
					authorUserId: USER_ID,
					channel: "internal",
					body: "Internal note",
					isInternal: true,
					createdAt: NOW,
					updatedAt: NOW,
				},
				{
					id: "ticket-customer-msg-2",
					ticketId: "ticket-customer-1",
					organizationId: ORG_ID,
					authorUserId: USER_ID,
					channel: "web",
					body: "Visible note",
					isInternal: false,
					createdAt: NOW,
					updatedAt: NOW,
				},
			]);

		const customerContext = {
			activeMembership: null,
			session: {
				session: {
					id: "session-customer-1",
					createdAt: NOW,
					updatedAt: NOW,
					userId: CUSTOMER_USER_ID,
					expiresAt: new Date("2026-03-12T12:00:00.000Z"),
					token: "session-token-customer",
					activeOrganizationId: null,
				},
				user: {
					id: CUSTOMER_USER_ID,
					email: "api-support-customer@example.com",
				},
			} as unknown as Context["session"],
		} satisfies Partial<Context>;

		const thread = await callRpc(
			"/rpc/support/getMyTicket",
			{ ticketId: "ticket-customer-1" },
			customerContext
		);
		expect(thread.status).toBe(200);
		expect(
			(thread.body as { ticket: Record<string, unknown> }).ticket
		).not.toHaveProperty("assignedToUserId");
		expect(
			(thread.body as { messages: Array<{ isInternal: boolean }> }).messages
		).toMatchObject([{ isInternal: false }]);

		const reply = await callRpc(
			"/rpc/support/addMyMessage",
			{
				ticketId: "ticket-customer-1",
				body: "Customer reply",
			},
			customerContext
		);
		expect(reply.status).toBe(200);
		expect(reply.body).toMatchObject({
			body: "Customer reply",
			isInternal: false,
		});
	});
});
