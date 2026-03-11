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
	listingTypeConfig,
	organizationListingType,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { RPCHandler } from "@orpc/server/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import { appRouter } from "../handlers/index";

const ORG_ID = "api-listing-org-1";
const USER_ID = "api-listing-user-1";
const ACTIVE_TYPE_SLUG = "api-listing-type-active";
const INACTIVE_TYPE_SLUG = "api-listing-type-inactive";
const ENABLED_TYPE_SLUG = "api-listing-type-enabled";
const DISABLED_TYPE_SLUG = "api-listing-type-disabled";
const NOW = new Date("2026-03-11T12:00:00.000Z");

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Listing Org",
			slug: "listing-org",
			createdAt: NOW,
		});

		await db.insert(user).values({
			id: USER_ID,
			name: "Listing User",
			email: "listing@example.com",
			emailVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingTypeConfig).values([
			{
				id: ACTIVE_TYPE_SLUG,
				slug: ACTIVE_TYPE_SLUG,
				label: "Active Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 0,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: INACTIVE_TYPE_SLUG,
				slug: INACTIVE_TYPE_SLUG,
				label: "Inactive Type",
				metadataJsonSchema: {},
				isActive: false,
				sortOrder: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: ENABLED_TYPE_SLUG,
				slug: ENABLED_TYPE_SLUG,
				label: "Enabled Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 2,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: DISABLED_TYPE_SLUG,
				slug: DISABLED_TYPE_SLUG,
				label: "Disabled Type",
				metadataJsonSchema: {},
				isActive: true,
				sortOrder: 3,
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
	requestUrl: "http://example.test/rpc/listing/create",
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
			email: "listing@example.com",
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

describe("listing create RPC errors", () => {
	beforeEach(() => {
		getDb();
	});

	it("returns BAD_REQUEST for an unknown listing type", async () => {
		const result = await callRpc("/rpc/listing/create", {
			listingTypeSlug: "missing-type",
			name: "Broken Listing",
			slug: "broken-listing",
			description: "missing type",
		});

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({
			code: "BAD_REQUEST",
			message: "Unknown listing type",
		});
	});

	it("returns PRECONDITION_FAILED for an inactive listing type", async () => {
		const result = await callRpc("/rpc/listing/create", {
			listingTypeSlug: INACTIVE_TYPE_SLUG,
			name: "Inactive Type Listing",
			slug: "inactive-type-listing",
			description: "inactive type",
		});

		expect(result.status).toBe(412);
		expect(result.body).toMatchObject({
			code: "PRECONDITION_FAILED",
			message: "Listing type is inactive",
		});
	});

	it("returns PRECONDITION_FAILED when org-specific listing types are configured and the slug is not enabled", async () => {
		await getDb().insert(organizationListingType).values({
			id: crypto.randomUUID(),
			organizationId: ORG_ID,
			listingTypeSlug: ENABLED_TYPE_SLUG,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await callRpc("/rpc/listing/create", {
			listingTypeSlug: DISABLED_TYPE_SLUG,
			name: "Disabled Type Listing",
			slug: "disabled-type-listing",
			description: "not enabled",
		});

		expect(result.status).toBe(412);
		expect(result.body).toMatchObject({
			code: "PRECONDITION_FAILED",
			message: "Listing type is not enabled for this organization",
		});
	});

	it("returns BAD_REQUEST for an invalid timezone", async () => {
		const result = await callRpc("/rpc/listing/create", {
			listingTypeSlug: ACTIVE_TYPE_SLUG,
			name: "Invalid Timezone Listing",
			slug: "invalid-timezone-listing",
			description: "bad timezone",
			timezone: "Mars/Olympus",
		});

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});

describe("listing type option RPCs", () => {
	beforeEach(() => {
		getDb();
	});

	it("returns active platform listing types when no org-specific rows exist", async () => {
		const result = await callRpc("/rpc/listing/listAvailableTypes", {});

		expect(result.status).toBe(200);
		const body = result.body as {
			defaultValue: string | null;
			items: Array<{
				icon: string | null;
				isDefault: boolean;
				label: string;
				metadataJsonSchema: Record<string, unknown>;
				value: string;
			}>;
		};

		expect(body.defaultValue).toBeNull();
		expect(body.items).toEqual([
			{
				icon: null,
				isDefault: false,
				label: "Active Type",
				metadataJsonSchema: {},
				value: ACTIVE_TYPE_SLUG,
			},
			{
				icon: null,
				isDefault: false,
				label: "Enabled Type",
				metadataJsonSchema: {},
				value: ENABLED_TYPE_SLUG,
			},
			{
				icon: null,
				isDefault: false,
				label: "Disabled Type",
				metadataJsonSchema: {},
				value: DISABLED_TYPE_SLUG,
			},
		]);
	});

	it("returns only active org-enabled types and exposes the default value", async () => {
		await getDb().insert(organizationListingType).values([
			{
				id: crypto.randomUUID(),
				organizationId: ORG_ID,
				listingTypeSlug: ENABLED_TYPE_SLUG,
				isDefault: true,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: crypto.randomUUID(),
				organizationId: ORG_ID,
				listingTypeSlug: DISABLED_TYPE_SLUG,
				isDefault: false,
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: crypto.randomUUID(),
				organizationId: ORG_ID,
				listingTypeSlug: INACTIVE_TYPE_SLUG,
				isDefault: false,
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);

		const result = await callRpc("/rpc/listing/listAvailableTypes", {});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			defaultValue: ENABLED_TYPE_SLUG,
			items: [
				{
					value: ENABLED_TYPE_SLUG,
					label: "Enabled Type",
					isDefault: true,
					metadataJsonSchema: {},
				},
				{
					value: DISABLED_TYPE_SLUG,
					label: "Disabled Type",
					isDefault: false,
					metadataJsonSchema: {},
				},
			],
		});
	});
});
