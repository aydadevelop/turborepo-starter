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
	bookingCancellationRequest,
	bookingPaymentAttempt,
	bookingRefund,
	listing,
	listingPublication,
	listingTypeConfig,
	organizationPaymentConfig,
	paymentProviderConfig,
} from "@my-app/db/schema/marketplace";
import {
	bootstrapTestDatabase,
	type TestDatabase,
} from "@my-app/db/test";
import {
	registerPaymentProvider,
	resetPaymentProviderRegistry,
	type PaymentProvider,
} from "@my-app/payment";
import { RPCHandler } from "@orpc/server/fetch";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../handlers/index";
import type { Context } from "../context";

const ORG_ID = "api-cancel-org-1";
const USER_ID = "api-cancel-user-1";
const LISTING_TYPE_ID = "api-cancel-listing-type-1";
const PROVIDER_CONFIG_ID = "api-cancel-provider-config-1";
const ORG_PAYMENT_CONFIG_ID = "api-cancel-org-payment-config-1";
const LISTING_ID = "api-cancel-listing-1";
const PUBLICATION_ID = "api-cancel-publication-1";
const BOOKING_ID = "api-cancel-booking-1";
const REQUEST_ID = "api-cancel-request-1";
const NOW = new Date("2026-03-10T12:00:00.000Z");
const FUTURE_START = new Date("2026-03-25T12:00:00.000Z");
const FUTURE_END = new Date("2026-03-25T16:00:00.000Z");

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "API Cancellation Org",
			slug: "api-cancellation-org",
			createdAt: NOW,
		});

		await db.insert(user).values({
			id: USER_ID,
			name: "API Cancellation User",
			email: "api-cancel@example.com",
			emailVerified: true,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingTypeConfig).values({
			id: LISTING_TYPE_ID,
			slug: LISTING_TYPE_ID,
			label: "Vessel",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(paymentProviderConfig).values({
			id: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments",
			supportedCurrencies: ["RUB"],
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(organizationPaymentConfig).values({
			id: ORG_PAYMENT_CONFIG_ID,
			organizationId: ORG_ID,
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			publicKey: "pk_live_test",
			encryptedCredentials: JSON.stringify({ apiSecret: "secret_live_test" }),
			credentialKeyVersion: 1,
			validationStatus: "validated",
			isActive: true,
			validatedAt: NOW,
			webhookEndpointId: "api-cancel-webhook-endpoint-1",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_ID,
			name: "API Cancellation Listing",
			slug: "api-cancellation-listing",
			status: "active",
			isActive: true,
			minimumDurationMinutes: 120,
			minimumNoticeMinutes: 60,
			timezone: "UTC",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(listingPublication).values({
			id: PUBLICATION_ID,
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
			publicationId: PUBLICATION_ID,
			merchantOrganizationId: ORG_ID,
			merchantPaymentConfigId: ORG_PAYMENT_CONFIG_ID,
			customerUserId: USER_ID,
			source: "web",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "not_applicable",
			startsAt: FUTURE_START,
			endsAt: FUTURE_END,
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
			createdAt: NOW,
			updatedAt: NOW,
		});
	},
});

const getDb = () => dbState.db;
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
	requestUrl: "http://example.test/rpc/booking/applyCancellation",
	session: {
		session: {
			id: "session-1",
			activeOrganizationId: ORG_ID,
		},
		user: {
			id: USER_ID,
			email: "api-cancel@example.com",
		},
	} as Context["session"],
	...overrides,
});

const callApplyCancellation = async (
	requestId: string,
	contextOverrides: Partial<Context> = {},
): Promise<{ status: number; body: unknown }> => {
	const request = new Request(
		"http://example.test/rpc/booking/applyCancellation",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				json: { requestId },
			}),
		},
	);

	const result = await rpcHandler.handle(request, {
		prefix: "/rpc",
		context: createRpcContext(contextOverrides),
	});

	if (!result.matched || !result.response) {
		throw new Error("RPC request did not match booking.applyCancellation");
	}

	const rawBody = (await result.response.json()) as { json: unknown };

	return {
		status: result.response.status,
		body: rawBody.json,
	};
};

const registerTestProvider = (
	overrides: Partial<PaymentProvider> = {},
): PaymentProvider => {
	const provider: PaymentProvider = {
		providerId: "cloudpayments",
		refundPayment: vi.fn().mockResolvedValue({ externalRefundId: "cp-refund-1" }),
		...overrides,
	};

	registerPaymentProvider(provider);
	return provider;
};

const insertCancellationRequest = async (
	db: TestDatabase,
	overrides: Partial<typeof bookingCancellationRequest.$inferInsert> = {},
	): Promise<string> => {
	const requestId = overrides.id ?? crypto.randomUUID();

	await db.insert(bookingCancellationRequest).values({
		id: requestId,
		bookingId: BOOKING_ID,
		organizationId: ORG_ID,
		requestedByUserId: USER_ID,
		initiatedByRole: "manager",
		status: "requested",
		reason: "Operator approved cancellation",
		reasonCode: "OWNER_OPERATIONAL_ISSUE",
		bookingTotalPriceCents: 10_000,
		penaltyAmountCents: 5_000,
		refundAmountCents: 5_000,
		currency: "RUB",
		requestedAt: NOW,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	});

	return requestId;
};

const insertCapturedAttempt = async (
	db: TestDatabase,
	overrides: Partial<typeof bookingPaymentAttempt.$inferInsert> = {},
) => {
	await db.insert(bookingPaymentAttempt).values({
		id: "api-cancel-payment-attempt-1",
		bookingId: BOOKING_ID,
		organizationId: ORG_ID,
		provider: "cloudpayments",
		idempotencyKey: "api-cancel-payment-attempt-1",
		providerIntentId: "455",
		status: "captured",
		amountCents: 10_000,
		currency: "RUB",
		processedAt: NOW,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	});
};

beforeEach(() => {
	dbModuleState.current = getDb();
	resetPaymentProviderRegistry();
});

describe("booking.applyCancellation live handler", () => {
	it("returns { requestId, refundId }, updates booking/request state, and executes the registered payment provider through the live API path", async () => {
		const db = getDb();
		const provider = registerTestProvider();

		const requestId = await insertCancellationRequest(db, {
			id: "api-cancel-request-live",
		});
		await insertCapturedAttempt(db);

		const result = await callApplyCancellation(requestId);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			requestId,
			refundId: expect.any(String),
		});

		expect(provider.refundPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				amountCents: 5_000,
				providerPaymentId: "455",
				currency: "RUB",
				idempotencyKey: `${requestId}:refund`,
			}),
			expect.objectContaining({
				providerId: "cloudpayments",
				publicKey: "pk_live_test",
				credentials: expect.objectContaining({ apiSecret: "secret_live_test" }),
			}),
		);

		const [updatedBooking] = await db
			.select()
			.from(booking)
			.where(eq(booking.id, BOOKING_ID))
			.limit(1);
		expect(updatedBooking).toMatchObject({
			status: "cancelled",
			paymentStatus: "refunded",
			refundAmountCents: 5_000,
		});

		const [updatedRequest] = await db
			.select()
			.from(bookingCancellationRequest)
			.where(eq(bookingCancellationRequest.id, requestId))
			.limit(1);
		expect(updatedRequest).toMatchObject({
			status: "applied",
			appliedByUserId: USER_ID,
			refundStatus: "processed",
			refundReference: "cp-refund-1",
		});

		const [refund] = await db
			.select()
			.from(bookingRefund)
			.where(
				and(
					eq(bookingRefund.bookingId, BOOKING_ID),
					eq(bookingRefund.status, "processed"),
				),
			)
			.limit(1);
		expect(refund).toMatchObject({
			amountCents: 5_000,
			externalRefundId: "cp-refund-1",
			provider: "cloudpayments",
			status: "processed",
		});
	});

	it("still succeeds through the live workflow path for zero-refund requests without calling the payment provider", async () => {
		const db = getDb();
		const provider = registerTestProvider();

		const requestId = await insertCancellationRequest(db, {
			id: "api-cancel-request-zero-refund",
			refundAmountCents: 0,
			penaltyAmountCents: 10_000,
			reason: "Non-refundable cancellation",
			reasonCode: "CUSTOMER_CHANGED_PLANS",
		});

		const result = await callApplyCancellation(requestId);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			requestId,
			refundId: null,
		});
		expect(provider.refundPayment).not.toHaveBeenCalled();

		const refunds = await db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, BOOKING_ID));
		expect(refunds).toHaveLength(0);

		const [updatedRequest] = await db
			.select()
			.from(bookingCancellationRequest)
			.where(eq(bookingCancellationRequest.id, requestId))
			.limit(1);
		expect(updatedRequest).toMatchObject({
			status: "applied",
			appliedByUserId: USER_ID,
		});
	});

	it("translates a missing cancellation request into the existing NOT_FOUND ORPC outcome", async () => {
		registerTestProvider();

		const result = await callApplyCancellation("missing-request");

		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({ code: "NOT_FOUND" });
	});

	it("translates an invalid request state into the existing BAD_REQUEST ORPC outcome", async () => {
		const db = getDb();
		registerTestProvider();

		const requestId = await insertCancellationRequest(db, {
			id: "api-cancel-request-invalid-state",
			status: "applied",
			appliedByUserId: USER_ID,
			appliedAt: NOW,
		});

		const result = await callApplyCancellation(requestId);

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({
			code: "BAD_REQUEST",
			message: "Request is not in 'requested' state",
		});
	});
});