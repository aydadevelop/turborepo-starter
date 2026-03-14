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
import { listing, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { RPCHandler } from "@orpc/server/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import { appRouter } from "../handlers/index";

const ORG_ID = "api-availability-org-1";
const OTHER_ORG_ID = "api-availability-org-2";
const USER_ID = "api-availability-user-1";
const LISTING_TYPE_ID = "api-availability-type-1";
const LISTING_ID = "api-availability-listing-1";
const OTHER_LISTING_ID = "api-availability-listing-2";
const NOW = new Date("2026-03-14T12:00:00.000Z");

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values([
			{
				id: ORG_ID,
				name: "Availability Org",
				slug: "availability-org",
				createdAt: NOW,
			},
			{
				id: OTHER_ORG_ID,
				name: "Other Availability Org",
				slug: "other-availability-org",
				createdAt: NOW,
			},
		]);

		await db.insert(user).values({
			id: USER_ID,
			name: "Availability User",
			email: "availability@example.com",
			emailVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

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

		await db.insert(listing).values([
			{
				id: LISTING_ID,
				organizationId: ORG_ID,
				listingTypeSlug: LISTING_TYPE_ID,
				name: "Primary Listing",
				slug: "primary-listing",
				status: "draft",
				isActive: true,
				timezone: "UTC",
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: OTHER_LISTING_ID,
				organizationId: OTHER_ORG_ID,
				listingTypeSlug: LISTING_TYPE_ID,
				name: "Other Listing",
				slug: "other-listing",
				status: "draft",
				isActive: true,
				timezone: "UTC",
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);
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
	requestUrl: "http://example.test/rpc/availability/getWorkspaceState",
	session: {
		session: {
			id: "session-1",
			createdAt: NOW,
			updatedAt: NOW,
			userId: USER_ID,
			expiresAt: new Date("2026-03-15T12:00:00.000Z"),
			token: "session-token",
			activeOrganizationId: ORG_ID,
		},
		user: {
			id: USER_ID,
			email: "availability@example.com",
		},
	} as unknown as Context["session"],
	...overrides,
});

const callRpc = async (
	path: string,
	json: unknown,
	contextOverrides: Partial<Context> = {},
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

describe("availability router", () => {
	beforeEach(() => {
		getDb();
	});

	it("manages workspace state through the booking availability domain", async () => {
		const addedRule = await callRpc("/rpc/availability/addRule", {
			listingId: LISTING_ID,
			dayOfWeek: 2,
			startMinute: 540,
			endMinute: 720,
		});
		expect(addedRule.status).toBe(200);
		expect(addedRule.body).toMatchObject({
			listingId: LISTING_ID,
			dayOfWeek: 2,
			startMinute: 540,
			endMinute: 720,
		});

		const addedBlock = await callRpc("/rpc/availability/addBlock", {
			listingId: LISTING_ID,
			startsAt: "2026-04-10T09:00:00.000Z",
			endsAt: "2026-04-10T12:00:00.000Z",
			reason: "Maintenance",
		});
		expect(addedBlock.status).toBe(200);

		const addedException = await callRpc("/rpc/availability/addException", {
			listingId: LISTING_ID,
			date: "2026-04-11",
			isAvailable: false,
			reason: "Private event",
		});
		expect(addedException.status).toBe(200);

		const workspace = await callRpc("/rpc/availability/getWorkspaceState", {
			listingId: LISTING_ID,
		});
		expect(workspace.status).toBe(200);
		expect(workspace.body).toMatchObject({
			activeRuleCount: 1,
			activeBlockCount: 1,
			exceptionCount: 1,
			hasAvailability: true,
			rules: [
				{
					listingId: LISTING_ID,
					dayOfWeek: 2,
				},
			],
			blocks: [
				{
					listingId: LISTING_ID,
					reason: "Maintenance",
					startsAt: "2026-04-10T09:00:00.000Z",
					endsAt: "2026-04-10T12:00:00.000Z",
				},
			],
			exceptions: [
				{
					listingId: LISTING_ID,
					date: "2026-04-11",
					reason: "Private event",
				},
			],
		});
	});

	it("checks public slot availability against blocks", async () => {
		const blockedRange = {
			listingId: LISTING_ID,
			startsAt: "2026-05-01T10:00:00.000Z",
			endsAt: "2026-05-01T14:00:00.000Z",
		};

		const addedBlock = await callRpc("/rpc/availability/addBlock", {
			...blockedRange,
			reason: "Out of service",
		});
		expect(addedBlock.status).toBe(200);

		const overlapping = await callRpc("/rpc/availability/checkSlot", {
			listingId: LISTING_ID,
			startsAt: "2026-05-01T11:00:00.000Z",
			endsAt: "2026-05-01T12:00:00.000Z",
		});
		expect(overlapping.status).toBe(200);
		expect(overlapping.body).toEqual({ available: false });

		const freeSlot = await callRpc("/rpc/availability/checkSlot", {
			listingId: LISTING_ID,
			startsAt: "2026-05-01T15:00:00.000Z",
			endsAt: "2026-05-01T16:00:00.000Z",
		});
		expect(freeSlot.status).toBe(200);
		expect(freeSlot.body).toEqual({ available: true });
	});

	it("scopes organization-owned availability mutations", async () => {
		const result = await callRpc("/rpc/availability/listRules", {
			listingId: OTHER_LISTING_ID,
		});

		expect(result.status).toBe(404);
	});
});
