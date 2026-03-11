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
import { listingCalendarConnection } from "@my-app/db/schema/availability";
import {
	listing,
	listingPublication,
	listingTypeConfig,
	paymentProviderConfig,
} from "@my-app/db/schema/marketplace";
import {
	bootstrapTestDatabase,
	type TestDatabase,
} from "@my-app/db/test";
import { RPCHandler } from "@orpc/server/fetch";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../handlers/index";
import type { Context } from "../context";

const ORG_ID = "api-onboarding-org-1";
const OTHER_ORG_ID = "api-onboarding-org-2";
const USER_ID = "api-onboarding-user-1";
const LISTING_TYPE_ID = "api-onboarding-listing-type-1";
const LISTING_ID = "api-onboarding-listing-1";
const OTHER_LISTING_ID = "api-onboarding-listing-2";
const PROVIDER_CONFIG_ID = "api-onboarding-provider-config-1";
const NOW = new Date("2026-03-10T12:00:00.000Z");

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values([
			{
				id: ORG_ID,
				name: "API Onboarding Org",
				slug: "api-onboarding-org",
				createdAt: NOW,
			},
			{
				id: OTHER_ORG_ID,
				name: "Other Org",
				slug: "api-onboarding-org-other",
				createdAt: NOW,
			},
		]);

		await db.insert(user).values({
			id: USER_ID,
			name: "API Onboarding User",
			email: "api-onboarding@example.com",
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

		await db.insert(paymentProviderConfig).values({
			id: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments",
			supportedCurrencies: ["RUB"],
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

const createRpcContext = (
	overrides: Partial<Context> = {},
): Context => ({
	activeMembership: {
		organizationId: ORG_ID,
		role: "org_owner",
	},
	notificationQueue: {
		send: vi.fn().mockResolvedValue(undefined),
	},
	requestCookies: {},
	requestHostname: "example.test",
	requestUrl: "http://example.test/rpc/organization/getOnboardingStatus",
	session: {
		session: {
			id: "session-1",
			createdAt: NOW,
			updatedAt: NOW,
			userId: USER_ID,
			expiresAt: new Date("2026-03-11T12:00:00.000Z"),
			token: "session-token",
			activeOrganizationId: ORG_ID,
		},
		user: {
			id: USER_ID,
			email: "api-onboarding@example.com",
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

	if (!result.matched || !result.response) {
		throw new Error(`RPC request did not match ${path}`);
	}

	const rawBody = (await result.response.json()) as { json: unknown };

	return {
		status: result.response.status,
		body: rawBody.json,
	};
};

describe("organization onboarding + calendar routes", () => {
	beforeEach(() => {
		getDb();
	});

	it("persists onboarding state as payment, calendar, and publication become ready", async () => {
		const initial = await callRpc(
			"/rpc/organization/getOnboardingStatus",
			{},
		);
		expect(initial.status).toBe(200);
		expect(initial.body).toMatchObject({
			organizationId: ORG_ID,
			paymentConfigured: false,
			calendarConnected: false,
			listingPublished: false,
			isComplete: false,
			completedAt: null,
		});

		const connectedProvider = await callRpc("/rpc/payments/connectProvider", {
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			publicKey: "pk_live_test",
			encryptedCredentials: JSON.stringify({ apiSecret: "secret_live_test" }),
		});
		expect(connectedProvider.status).toBe(200);
		const providerConfig = connectedProvider.body as {
			webhookEndpointId: string;
		};

		const paymentReady = await callRpc("/rpc/payments/receiveWebhook", {
			endpointId: providerConfig.webhookEndpointId,
			webhookType: "check",
			payload: {
				TransactionId: 12345,
			},
		});
		expect(paymentReady.status).toBe(200);

		const connectedCalendar = await callRpc("/rpc/calendar/connect", {
			listingId: LISTING_ID,
			provider: "google",
			calendarId: "calendar-1",
		});
		expect(connectedCalendar.status).toBe(200);
		const calendarConnection = connectedCalendar.body as { id: string };

		const publishedListing = await callRpc("/rpc/listing/publish", {
			id: LISTING_ID,
		});
		expect(publishedListing.status).toBe(200);

		const complete = await callRpc(
			"/rpc/organization/getOnboardingStatus",
			{},
		);
		expect(complete.status).toBe(200);
		expect(complete.body).toMatchObject({
			organizationId: ORG_ID,
			paymentConfigured: true,
			calendarConnected: true,
			listingPublished: true,
			isComplete: true,
		});
		expect(
			(complete.body as { completedAt: string | null }).completedAt,
		).not.toBeNull();

		const listConnections = await callRpc("/rpc/calendar/listConnections", {
			listingId: LISTING_ID,
		});
		expect(listConnections.status).toBe(200);
		expect(listConnections.body).toMatchObject([
			{
				id: calendarConnection.id,
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				isActive: true,
			},
		]);

		const disconnectedCalendar = await callRpc("/rpc/calendar/disconnect", {
			connectionId: calendarConnection.id,
		});
		expect(disconnectedCalendar.status).toBe(200);
		expect(disconnectedCalendar.body).toEqual({ success: true });

		const incomplete = await callRpc(
			"/rpc/organization/getOnboardingStatus",
			{},
		);
		expect(incomplete.status).toBe(200);
		expect(incomplete.body).toMatchObject({
			paymentConfigured: true,
			calendarConnected: false,
			listingPublished: true,
			isComplete: false,
			completedAt: null,
		});
	});

	it("scopes calendar listConnections to the active organization", async () => {
		const db = getDb();

		await db.insert(listingCalendarConnection).values({
			id: "other-org-calendar-connection",
			listingId: OTHER_LISTING_ID,
			organizationId: OTHER_ORG_ID,
			provider: "manual",
			externalCalendarId: "other-calendar",
			isActive: true,
		});

		const result = await callRpc("/rpc/calendar/listConnections", {
			listingId: OTHER_LISTING_ID,
		});

		expect(result.status).toBe(404);
	});

	it("creates the expected publication row when onboarding completes", async () => {
		await callRpc("/rpc/listing/publish", { id: LISTING_ID });

		const publications = await getDb()
			.select()
			.from(listingPublication)
			.where(eq(listingPublication.listingId, LISTING_ID));

		expect(publications).toHaveLength(1);
		expect(publications[0]?.organizationId).toBe(ORG_ID);
	});
});
