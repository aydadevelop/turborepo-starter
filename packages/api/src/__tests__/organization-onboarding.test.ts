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

import {
	clearCalendarAdapterRegistry,
	FakeCalendarAdapter,
	registerCalendarAdapter,
} from "@my-app/calendar";
import { organization, user } from "@my-app/db/schema/auth";
import {
	listingCalendarConnection,
	organizationCalendarAccount,
	organizationCalendarSource,
} from "@my-app/db/schema/availability";
import {
	listing,
	listingPublication,
	listingTypeConfig,
	paymentProviderConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { clearEventPushers } from "@my-app/events";
import { registerOrganizationOverlayProjector } from "@my-app/organization";
import { RPCHandler } from "@orpc/server/fetch";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import { appRouter } from "../handlers/index";

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

describe("organization onboarding + calendar routes", () => {
	beforeEach(() => {
		const db = getDb();
		clearEventPushers();
		clearCalendarAdapterRegistry();
		registerCalendarAdapter("google", new FakeCalendarAdapter());
		registerOrganizationOverlayProjector(
			db as unknown as Parameters<
				typeof registerOrganizationOverlayProjector
			>[0]
		);
	});

	it("persists onboarding state as payment, calendar, and publication become ready", async () => {
		const initial = await callRpc("/rpc/organization/getOnboardingStatus", {});
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
				TransactionId: 12_345,
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

		const complete = await callRpc("/rpc/organization/getOnboardingStatus", {});
		expect(complete.status).toBe(200);
		expect(complete.body).toMatchObject({
			organizationId: ORG_ID,
			paymentConfigured: true,
			calendarConnected: true,
			listingPublished: true,
			isComplete: true,
		});
		expect(
			(complete.body as { completedAt: string | null }).completedAt
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
			{}
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

	it("manages organization calendar accounts and exposes them through calendar workspace state", async () => {
		const connectedAccount = await callRpc("/rpc/calendar/connectAccount", {
			provider: "google",
			externalAccountId: "google-account-1",
			accountEmail: "fleet@example.com",
			displayName: "Fleet Calendar",
		});
		expect(connectedAccount.status).toBe(200);
		const account = connectedAccount.body as { id: string };

		const listedAccounts = await callRpc("/rpc/calendar/listAccounts", {});
		expect(listedAccounts.status).toBe(200);
		expect(listedAccounts.body).toMatchObject([
			{
				id: account.id,
				provider: "google",
				accountEmail: "fleet@example.com",
				status: "connected",
			},
		]);

		await callRpc("/rpc/calendar/connect", {
			listingId: LISTING_ID,
			provider: "google",
			calendarId: "calendar-1",
		});

		const workspace = await callRpc("/rpc/calendar/getWorkspaceState", {
			listingId: LISTING_ID,
		});
		expect(workspace.status).toBe(200);
		expect(workspace.body).toMatchObject({
			accountCount: 1,
			connectedAccountCount: 1,
			accounts: [
				{
					id: account.id,
					provider: "google",
					displayName: "Fleet Calendar",
				},
			],
			activeConnectionCount: 1,
		});

		const disconnected = await callRpc("/rpc/calendar/disconnectAccount", {
			accountId: account.id,
		});
		expect(disconnected.status).toBe(200);
		expect(disconnected.body).toEqual({ success: true });

		const listedAfterDisconnect = await callRpc(
			"/rpc/calendar/listAccounts",
			{}
		);
		expect(listedAfterDisconnect.status).toBe(200);
		expect(listedAfterDisconnect.body).toMatchObject([
			{
				id: account.id,
				status: "disconnected",
			},
		]);
	});

	it("refreshes discovered account sources and attaches them to a listing", async () => {
		const db = getDb();

		await db.insert(organizationCalendarAccount).values({
			id: "calendar-account-1",
			organizationId: ORG_ID,
			provider: "google",
			externalAccountId: "google-account-1",
			accountEmail: "fleet@example.com",
			displayName: "Fleet Calendar",
			status: "connected",
			providerMetadata: {
				credentials: {
					sources: [
						{
							externalCalendarId: "calendar-primary",
							name: "Primary fleet calendar",
							timezone: "Europe/Moscow",
							isPrimary: true,
						},
						{
							externalCalendarId: "calendar-backup",
							name: "Backup fleet calendar",
							timezone: "Europe/Moscow",
							isPrimary: false,
						},
					],
				},
			},
			createdAt: NOW,
			updatedAt: NOW,
		});

		const refreshed = await callRpc("/rpc/calendar/refreshAccountSources", {
			accountId: "calendar-account-1",
		});
		expect(refreshed.status).toBe(200);
		expect(refreshed.body).toMatchObject([
			{
				calendarAccountId: "calendar-account-1",
				externalCalendarId: "calendar-primary",
				name: "Primary fleet calendar",
			},
			{
				calendarAccountId: "calendar-account-1",
				externalCalendarId: "calendar-backup",
				name: "Backup fleet calendar",
			},
		]);

		const listed = await callRpc("/rpc/calendar/listSources", {});
		expect(listed.status).toBe(200);
		const [firstSource] = listed.body as Array<{ id: string }>;
		expect(firstSource).toBeDefined();
		if (!firstSource) {
			throw new Error("Expected at least one calendar source");
		}

		const attached = await callRpc("/rpc/calendar/attachSource", {
			listingId: LISTING_ID,
			sourceId: firstSource.id,
		});
		expect(attached.status).toBe(200);
		expect(attached.body).toMatchObject({
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			calendarAccountId: "calendar-account-1",
			calendarSourceId: firstSource.id,
			provider: "google",
			isActive: true,
		});

		const [persistedSource] = await db
			.select()
			.from(organizationCalendarSource)
			.where(eq(organizationCalendarSource.id, firstSource.id))
			.limit(1);
		expect(persistedSource?.organizationId).toBe(ORG_ID);

		const [persistedConnection] = await db
			.select()
			.from(listingCalendarConnection)
			.where(eq(listingCalendarConnection.calendarSourceId, firstSource.id))
			.limit(1);
		expect(persistedConnection?.listingId).toBe(LISTING_ID);
		expect(persistedConnection?.calendarAccountId).toBe("calendar-account-1");
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

	it("returns overlay publishing summary for the active organization", async () => {
		await callRpc("/rpc/listing/publish", { id: LISTING_ID });

		const result = await callRpc("/rpc/organization/getOverlaySummary", {});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			onboarding: {
				organizationId: ORG_ID,
				listingPublished: true,
			},
			publishing: {
				totalListingCount: 1,
				draftListingCount: 0,
				publishedListingCount: 1,
				unpublishedListingCount: 0,
				activePublicationCount: 1,
				reviewPendingCount: 1,
			},
			distribution: {
				marketplacePublicationCount: 1,
				ownSitePublicationCount: 0,
				listingsWithoutPublicationCount: 0,
			},
			moderation: {
				reviewPendingCount: 1,
				approvedListingCount: 0,
				unapprovedActiveListingCount: 1,
			},
			manualOverrides: {
				activeCount: 0,
			},
		});
	});

	it("exposes moderation and distribution actions through the organization router", async () => {
		const approved = await callRpc("/rpc/organization/approveListing", {
			listingId: LISTING_ID,
			note: "Approved for marketplace launch",
		});
		expect(approved.status).toBe(200);
		expect(approved.body).toMatchObject({
			listingId: LISTING_ID,
			isApproved: true,
		});
		expect(
			(approved.body as { approvedAt: string | null }).approvedAt
		).not.toBeNull();

		const published = await callRpc(
			"/rpc/organization/publishListingToChannel",
			{
				listingId: LISTING_ID,
				channelType: "own_site",
			}
		);
		expect(published.status).toBe(200);
		expect(published.body).toEqual({
			listingId: LISTING_ID,
			activeChannels: ["own_site"],
			activePublicationCount: 1,
			isPublished: true,
		});

		const unpublished = await callRpc("/rpc/organization/unpublishListing", {
			listingId: LISTING_ID,
		});
		expect(unpublished.status).toBe(200);
		expect(unpublished.body).toEqual({
			listingId: LISTING_ID,
			activeChannels: [],
			activePublicationCount: 0,
			isPublished: false,
		});

		const cleared = await callRpc("/rpc/organization/clearListingApproval", {
			listingId: LISTING_ID,
			note: "Cleared after listing content changed",
		});
		expect(cleared.status).toBe(200);
		expect(cleared.body).toEqual({
			listingId: LISTING_ID,
			approvedAt: null,
			isApproved: false,
		});

		const audit = await callRpc("/rpc/organization/getListingModerationAudit", {
			listingId: LISTING_ID,
		});
		expect(audit.status).toBe(200);
		expect(audit.body).toMatchObject([
			{
				listingId: LISTING_ID,
				action: "approval_cleared",
				actedByUserId: USER_ID,
				actedByDisplayName: "API Onboarding User",
				note: "Cleared after listing content changed",
			},
			{
				listingId: LISTING_ID,
				action: "approved",
				actedByUserId: USER_ID,
				actedByDisplayName: "API Onboarding User",
				note: "Approved for marketplace launch",
			},
		]);
	});
});
