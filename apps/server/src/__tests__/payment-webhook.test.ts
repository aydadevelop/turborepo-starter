import {
	registerPaymentWebhookAdapter,
	resetPaymentWebhookRegistry,
} from "@my-app/api/payments/webhooks/registry";
import type { PaymentWebhookAdapter } from "@my-app/api/payments/webhooks/types";
import { organization } from "@my-app/db/schema/auth";
import {
	booking,
	bookingPaymentAttempt,
	listing,
	listingPublication,
	listingTypeConfig,
	organizationPaymentConfig,
	paymentProviderConfig,
	paymentWebhookEvent,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route under test delegates to internalServerRouteProcedures which calls
// the real adapter registry. Stub adapters cover provider/type/auth/body edge
// cases, while live-ingress tests below wire the real CloudPayments adapter to
// a PGlite-backed database.

const ORG_ID = "server-webhook-org-1";
const PROVIDER_CONFIG_ID = "server-webhook-provider-config-1";
const WEBHOOK_ENDPOINT_ID = "server-webhook-endpoint-1";
const BOOKING_ID = "server-webhook-booking-1";
const PUB_ID = "server-webhook-pub-1";
const LISTING_ID = "server-webhook-listing-1";
const LISTING_TYPE_SLUG = "server-webhook-type";
const LIVE_PUBLIC_ID = "pk_live_route";
const LIVE_API_SECRET = "api_secret_live_route";

const liveRouteTestDbState = bootstrapTestDatabase({
	seedStrategy: "beforeAll",
	seed: async (db: TestDatabase) => {
		const now = new Date();
		const future = new Date(now.getTime() + 30 * 24 * 3_600_000);

		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Server Webhook Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Webhook Route Org",
			slug: "webhook-route-org",
		});
		await db.insert(paymentProviderConfig).values({
			id: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments Route Test",
			supportedCurrencies: ["RUB"],
		});
		await db.insert(organizationPaymentConfig).values({
			id: "server-webhook-org-pay-cfg-1",
			organizationId: ORG_ID,
			providerConfigId: PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			publicKey: LIVE_PUBLIC_ID,
			encryptedCredentials: "encrypted-live-creds",
			webhookEndpointId: WEBHOOK_ENDPOINT_ID,
			validationStatus: "pending",
			isActive: false,
		});
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Webhook Route Listing",
			slug: "webhook-route-listing",
		});
		await db.insert(listingPublication).values({
			id: PUB_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
		});
		await db.insert(booking).values({
			id: BOOKING_ID,
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUB_ID,
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "confirmed",
			startsAt: future,
			endsAt: new Date(future.getTime() + 3_600_000),
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
		});
	},
});

const sampleNotification = {
	TransactionId: 12_345,
	Amount: 1000,
	Currency: "RUB",
	Status: "Completed",
};

const createStubAdapter = (
	overrides: Partial<PaymentWebhookAdapter> = {}
): PaymentWebhookAdapter => ({
	provider: "cloudpayments",
	supportedWebhookTypes: new Set([
		"check",
		"pay",
		"fail",
		"confirm",
		"refund",
		"cancel",
	]),
	authenticateWebhook: vi.fn(),
	parseWebhookBody: vi.fn().mockResolvedValue(sampleNotification),
	processWebhook: vi.fn().mockResolvedValue({ code: 0 }),
	...overrides,
});

const createBasicAuthHeaders = () => ({
	Authorization: `Basic ${btoa(`${LIVE_PUBLIC_ID}:${LIVE_API_SECRET}`)}`,
	"Content-Type": "application/json",
});

const livePayNotification = {
	TransactionId: 98_765,
	InvoiceId: BOOKING_ID,
	Amount: 100,
	Currency: "RUB",
	Status: "Completed",
};

const setupLiveWebhookRoute = async () => {
	vi.resetModules();
	vi.doMock("@my-app/db", () => ({
		get db() {
			return liveRouteTestDbState.db;
		},
	}));

	const registry = await import("@my-app/api/payments/webhooks/registry");
	const { CloudPaymentsWebhookAdapter } = await import(
		"@my-app/api/payments/webhooks/cloudpayments/index"
	);

	registry.resetPaymentWebhookRegistry();
	const adapter = new CloudPaymentsWebhookAdapter({
		publicId: LIVE_PUBLIC_ID,
		apiSecret: LIVE_API_SECRET,
	});
	const processWebhookSpy = vi.spyOn(adapter, "processWebhook");
	registry.registerPaymentWebhookAdapter(adapter);

	const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

	return { paymentWebhookRoutes, processWebhookSpy };
};

describe("paymentWebhookRoutes", () => {
	let stubAdapter: PaymentWebhookAdapter;

	beforeEach(() => {
		resetPaymentWebhookRegistry();
		stubAdapter = createStubAdapter();
		registerPaymentWebhookAdapter(stubAdapter);
	});

	it("returns 404 for unknown provider", async () => {
		// No adapter registered for 'unknown'
		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/unknown/check",
			{ method: "POST" }
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Unknown payment provider",
		});
	});

	it("returns 404 for unknown webhook type", async () => {
		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/unknown",
			{ method: "POST" }
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Unknown webhook type" });
	});

	it("returns 401 on authentication failure", async () => {
		const { WebhookAuthError } = await import(
			"@my-app/api/payments/webhooks/errors"
		);
		stubAdapter = createStubAdapter({
			authenticateWebhook: vi.fn(() => {
				throw new WebhookAuthError("Invalid credentials");
			}),
		});
		registerPaymentWebhookAdapter(stubAdapter);

		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/check",
			{ method: "POST" }
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns 400 on payload parse failure", async () => {
		const { WebhookPayloadError } = await import(
			"@my-app/api/payments/webhooks/errors"
		);
		stubAdapter = createStubAdapter({
			parseWebhookBody: vi
				.fn()
				.mockRejectedValue(new WebhookPayloadError("Unsupported Content-Type")),
		});
		registerPaymentWebhookAdapter(stubAdapter);

		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/pay",
			{ method: "POST" }
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Unsupported Content-Type",
		});
	});

	it("returns 400 on unexpected parse error", async () => {
		stubAdapter = createStubAdapter({
			parseWebhookBody: vi.fn().mockRejectedValue(new Error("Unexpected")),
		});
		registerPaymentWebhookAdapter(stubAdapter);

		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/pay",
			{ method: "POST" }
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid request body" });
	});

	it("calls authenticateWebhook with the request", async () => {
		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/check",
			{ method: "POST" }
		);

		expect(stubAdapter.authenticateWebhook).toHaveBeenCalledWith(
			expect.any(Request)
		);
	});

	it("looks up adapter by provider param", async () => {
		const spy = vi
			.spyOn(
				await import("@my-app/api/payments/webhooks"),
				"getPaymentWebhookAdapter"
			)
			.mockReturnValue(stubAdapter);

		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/check",
			{ method: "POST" }
		);

		expect(spy).toHaveBeenCalledWith("cloudpayments");
		spy.mockRestore();
	});
});

describe("paymentWebhookRoutes live ingress", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("updates booking payment state through the production route without calling adapter.processWebhook", async () => {
		const { paymentWebhookRoutes, processWebhookSpy } =
			await setupLiveWebhookRoute();

		const response = await paymentWebhookRoutes.request(
			`/api/payments/webhook/cloudpayments/pay?endpointId=${WEBHOOK_ENDPOINT_ID}`,
			{
				method: "POST",
				headers: createBasicAuthHeaders(),
				body: JSON.stringify(livePayNotification),
			}
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ code: 0 });
		expect(processWebhookSpy).not.toHaveBeenCalled();

		const [updatedBooking] = await liveRouteTestDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, BOOKING_ID))
			.limit(1);
		expect(updatedBooking?.paymentStatus).toBe("paid");

		const [paymentConfig] = await liveRouteTestDbState.db
			.select()
			.from(organizationPaymentConfig)
			.where(
				eq(
					organizationPaymentConfig.webhookEndpointId,
					WEBHOOK_ENDPOINT_ID
				)
			)
			.limit(1);
		expect(paymentConfig?.validationStatus).toBe("validated");
		expect(paymentConfig?.isActive).toBe(true);
		expect(paymentConfig?.validatedAt).toBeInstanceOf(Date);
	});

	it("returns HTTP 400 when endpointId is missing instead of pretending success", async () => {
		const { paymentWebhookRoutes, processWebhookSpy } =
			await setupLiveWebhookRoute();

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/pay",
			{
				method: "POST",
				headers: createBasicAuthHeaders(),
				body: JSON.stringify(livePayNotification),
			}
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("endpointId"),
		});
		expect(processWebhookSpy).not.toHaveBeenCalled();
	});

	it("returns HTTP 200 with code 0 for duplicate webhooks while keeping payment reconciliation idempotent", async () => {
		const { paymentWebhookRoutes, processWebhookSpy } =
			await setupLiveWebhookRoute();

		const firstResponse = await paymentWebhookRoutes.request(
			`/api/payments/webhook/cloudpayments/pay?endpointId=${WEBHOOK_ENDPOINT_ID}`,
			{
				method: "POST",
				headers: createBasicAuthHeaders(),
				body: JSON.stringify(livePayNotification),
			}
		);
		const secondResponse = await paymentWebhookRoutes.request(
			`/api/payments/webhook/cloudpayments/pay?endpointId=${WEBHOOK_ENDPOINT_ID}`,
			{
				method: "POST",
				headers: createBasicAuthHeaders(),
				body: JSON.stringify(livePayNotification),
			}
		);

		expect(firstResponse.status).toBe(200);
		expect(await firstResponse.json()).toEqual({ code: 0 });
		expect(secondResponse.status).toBe(200);
		expect(await secondResponse.json()).toEqual({ code: 0 });
		expect(processWebhookSpy).not.toHaveBeenCalled();

		const webhookEvents = await liveRouteTestDbState.db
			.select()
			.from(paymentWebhookEvent)
			.where(
				eq(
					paymentWebhookEvent.requestSignature,
					`${WEBHOOK_ENDPOINT_ID}:pay:${livePayNotification.TransactionId}`
				)
			);
		expect(webhookEvents).toHaveLength(1);

		const paymentAttempts = await liveRouteTestDbState.db
			.select()
			.from(bookingPaymentAttempt)
			.where(
				eq(
					bookingPaymentAttempt.providerIntentId,
					String(livePayNotification.TransactionId)
				)
			);
		expect(paymentAttempts).toHaveLength(1);
	});
});
