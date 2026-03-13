import { organization, user } from "@my-app/db/schema/auth";
import {
	listingCalendarConnection,
	organizationCalendarAccount,
	organizationCalendarSource,
} from "@my-app/db/schema/availability";
import { listing, listingTypeConfig } from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	FakeCalendarAdapter,
	attachCalendarSourceToListing,
	clearCalendarAdapterRegistry,
	connectOrganizationCalendarAccount,
	disconnectOrganizationCalendarAccount,
	getCalendarWorkspaceState,
	listOrganizationCalendarAccounts,
	refreshOrganizationCalendarSources,
	registerCalendarAdapter,
} from "../index";

const NOW = new Date("2026-03-12T09:00:00.000Z");
const ORG_ID = "calendar-org-1";
const USER_ID = "calendar-user-1";
const LISTING_ID = "calendar-listing-1";
const LISTING_TYPE_SLUG = "calendar-boat-charter";

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Calendar Org",
			slug: "calendar-org",
			createdAt: NOW,
		});

		await db.insert(user).values({
			id: USER_ID,
			name: "Calendar Operator",
			email: "calendar-operator@example.com",
			emailVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingTypeConfig).values({
			id: "calendar-listing-type-1",
			slug: LISTING_TYPE_SLUG,
			label: "Boat charter",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Calendar Listing",
			slug: "calendar-listing",
			status: "draft",
			isActive: true,
			timezone: "UTC",
			createdAt: NOW,
			updatedAt: NOW,
		});
	},
});

describe("organization calendar account flow", () => {
	beforeEach(() => {
		clearCalendarAdapterRegistry();
		registerCalendarAdapter("google", new FakeCalendarAdapter());
	});

	it("creates or reconnects org calendar accounts and exposes them in workspace state", async () => {
		const db = dbState.db;

		const account = await connectOrganizationCalendarAccount(
			{
				organizationId: ORG_ID,
				provider: "google",
				externalAccountId: "google-account-1",
				accountEmail: "fleet@example.com",
				displayName: "Fleet Calendar",
				createdByUserId: USER_ID,
			},
			db
		);

		await db.insert(listingCalendarConnection).values({
			id: "connection-1",
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			calendarAccountId: account.id,
			provider: "google",
			externalCalendarId: "calendar-1",
			isPrimary: true,
			isActive: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const reconnected = await connectOrganizationCalendarAccount(
			{
				organizationId: ORG_ID,
				provider: "google",
				externalAccountId: "google-account-1",
				accountEmail: "fleet-updated@example.com",
				displayName: "Fleet Calendar Updated",
			},
			db
		);

		expect(reconnected.id).toBe(account.id);
		expect(reconnected.accountEmail).toBe("fleet-updated@example.com");

		const accounts = await listOrganizationCalendarAccounts(
			ORG_ID,
			db
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.status).toBe("connected");

		const workspace = await getCalendarWorkspaceState(
			LISTING_ID,
			ORG_ID,
			db
		);
		expect(workspace.accountCount).toBe(1);
		expect(workspace.connectedAccountCount).toBe(1);
		expect(workspace.accounts[0]?.displayName).toBe("Fleet Calendar Updated");
		expect(workspace.connections[0]?.calendarAccountId).toBe(account.id);
	});

	it("preserves the stored refresh token when a reconnect payload omits it", async () => {
		const db = dbState.db;

		const account = await connectOrganizationCalendarAccount(
			{
				organizationId: ORG_ID,
				provider: "google",
				externalAccountId: "google-account-refresh",
				accountEmail: "refresh@example.com",
				providerMetadata: {
					credentials: {
						refreshToken: "refresh-token-1",
						accessToken: "access-token-1",
					},
				},
			},
			db
		);

		await connectOrganizationCalendarAccount(
			{
				organizationId: ORG_ID,
				provider: "google",
				externalAccountId: "google-account-refresh",
				accountEmail: "refresh@example.com",
				providerMetadata: {
					credentials: {
						accessToken: "access-token-2",
					},
				},
			},
			db
		);

		const [persisted] = await db
			.select()
			.from(organizationCalendarAccount)
			.where(eq(organizationCalendarAccount.id, account.id))
			.limit(1);

		const credentials = (persisted?.providerMetadata as {
			credentials?: {
				accessToken?: string;
				refreshToken?: string;
			};
		} | null)?.credentials;

		expect(credentials?.accessToken).toBe("access-token-2");
		expect(credentials?.refreshToken).toBe("refresh-token-1");
	});

	it("marks accounts disconnected without deleting the record", async () => {
		const db = dbState.db;

		const account = await connectOrganizationCalendarAccount(
			{
				organizationId: ORG_ID,
				provider: "google",
				externalAccountId: "google-account-2",
				accountEmail: "ops@example.com",
			},
			db
		);

		const disconnected = await disconnectOrganizationCalendarAccount(
			account.id,
			ORG_ID,
			db
		);

		expect(disconnected.status).toBe("disconnected");

		const [persisted] = await db
			.select()
			.from(organizationCalendarAccount)
			.where(eq(organizationCalendarAccount.id, account.id))
			.limit(1);

		expect(persisted?.status).toBe("disconnected");
	});

	it("refreshes account sources and attaches them to a listing through the account-first flow", async () => {
		const db = dbState.db;

		const account = await connectOrganizationCalendarAccount(
			{
				organizationId: ORG_ID,
				provider: "google",
				externalAccountId: "google-account-3",
				accountEmail: "fleet-discovery@example.com",
				displayName: "Fleet Discovery",
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
			},
			db
		);

		const sources = await refreshOrganizationCalendarSources(
			account.id,
			ORG_ID,
			db
		);

		expect(sources).toHaveLength(2);
		expect(sources[0]?.calendarAccountId).toBe(account.id);
		expect(sources[0]?.organizationId).toBe(ORG_ID);

		const [persistedAccount] = await db
			.select()
			.from(organizationCalendarAccount)
			.where(eq(organizationCalendarAccount.id, account.id))
			.limit(1);

		expect(persistedAccount?.status).toBe("connected");
		expect(persistedAccount?.lastSyncedAt).not.toBeNull();

		const [primarySource] = await db
			.select()
			.from(organizationCalendarSource)
			.where(eq(organizationCalendarSource.externalCalendarId, "calendar-primary"))
			.limit(1);

		expect(primarySource?.name).toBe("Primary fleet calendar");

		const connection = await attachCalendarSourceToListing(
			{
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				sourceId: sources[0]!.id,
				createdByUserId: USER_ID,
			},
			db
		);

		expect(connection.calendarAccountId).toBe(account.id);
		expect(connection.calendarSourceId).toBe(sources[0]!.id);
		expect(connection.externalCalendarId).toBe("calendar-primary");

		const [persistedConnection] = await db
			.select()
			.from(listingCalendarConnection)
			.where(eq(listingCalendarConnection.id, connection.id))
			.limit(1);

		expect(persistedConnection?.calendarSourceId).toBe(sources[0]!.id);

		const workspace = await getCalendarWorkspaceState(LISTING_ID, ORG_ID, db);
		expect(workspace.sourceCount).toBe(2);
		expect(workspace.activeSourceCount).toBe(2);
		expect(workspace.sources.map((source) => source.name)).toContain(
			"Primary fleet calendar"
		);
		expect(workspace.connections[0]?.calendarSourceId).toBe(sources[0]!.id);
	});
});
