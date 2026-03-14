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

import { organization } from "@my-app/db/schema/auth";
import { listingAvailabilityRule } from "@my-app/db/schema/availability";
import {
	bookingDiscountCode,
	listing,
	listingPricingProfile,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { RPCHandler } from "@orpc/server/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import { appRouter } from "../handlers/index";

const ORG_ID = "api-storefront-org";
const LISTING_ID = "api-storefront-listing";
const TYPE_SLUG = "api-storefront-boat";
const TARGET_DATE = "2030-01-15";
const TARGET_WEEKDAY = new Date(`${TARGET_DATE}T00:00:00.000Z`).getUTCDay();

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Storefront Org",
			slug: "storefront-org",
		});

		await db.insert(listingTypeConfig).values({
			id: TYPE_SLUG,
			slug: TYPE_SLUG,
			label: "Boat Rent",
			serviceFamily: "boat_rent",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: TYPE_SLUG,
			name: "Public Boat",
			slug: "public-boat",
			timezone: "UTC",
			minimumDurationMinutes: 60,
			workingHoursStart: 9,
			workingHoursEnd: 12,
			isActive: true,
			status: "active",
		});

		await db.insert(listingPublication).values({
			id: "pub-storefront",
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "platform_marketplace",
			isActive: true,
			visibility: "public",
			merchantType: "platform",
		});

		await db.insert(listingAvailabilityRule).values({
			id: "rule-storefront",
			listingId: LISTING_ID,
			dayOfWeek: TARGET_WEEKDAY,
			startMinute: 9 * 60,
			endMinute: 12 * 60,
			isActive: true,
		});

		await db.insert(listingPricingProfile).values({
			id: "profile-storefront",
			listingId: LISTING_ID,
			name: "Default public pricing",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			minimumHours: 1,
			isDefault: true,
		});

		await db.insert(bookingDiscountCode).values({
			id: "discount-storefront",
			organizationId: ORG_ID,
			appliesToListingId: LISTING_ID,
			code: "STORE10",
			name: "Storefront ten",
			discountType: "percentage",
			discountValue: 10,
			minimumSubtotalCents: 0,
			isActive: true,
		});
	},
});

const getDb = () => {
	const db = dbState.db;
	dbModuleState.current = db;
	return db;
};

const rpcHandler = new RPCHandler(appRouter);

const createRpcContext = (): Context => ({
	activeMembership: null,
	requestHostname: "example.test",
	requestUrl: "http://example.test/rpc/storefront/getBookingSurface",
	requestCookies: {},
	session: null as Context["session"],
	notificationQueue: {
		send: vi.fn().mockResolvedValue(undefined),
	},
});

const callRpc = async (
	path: string,
	json: unknown
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
		context: createRpcContext(),
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

describe("storefront getBookingSurface RPC", () => {
	beforeEach(() => {
		getDb();
	});

	it("returns a composed public booking surface", async () => {
		const result = await callRpc("/rpc/storefront/getBookingSurface", {
			listingId: LISTING_ID,
			date: TARGET_DATE,
			durationMinutes: 60,
			passengers: 4,
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			listingId: LISTING_ID,
			serviceFamily: "boat_rent",
			pricingConfigured: true,
			currency: "RUB",
			summary: {
				availableSlotCount: 5,
				totalSlotCount: 5,
			},
		});
	});

	it("returns discount previews when a valid code is supplied", async () => {
		const result = await callRpc("/rpc/storefront/getBookingSurface", {
			listingId: LISTING_ID,
			date: TARGET_DATE,
			durationMinutes: 60,
			passengers: 4,
			discountCode: "store10",
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			requestedDiscountCode: "STORE10",
		});

		const surface = result.body as {
			slots: Array<{
				status: string;
				quote: null | {
					discountPreview: null | {
						code: string;
						status: string;
					};
				};
			}>;
		};
		expect(
			surface.slots.find((slot) => slot.status === "available")?.quote
				?.discountPreview
		).toMatchObject({
			code: "STORE10",
			status: "applied",
		});
	});
});
