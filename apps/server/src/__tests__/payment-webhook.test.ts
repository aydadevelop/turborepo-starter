import {
	registerPaymentWebhookAdapter,
	resetPaymentWebhookRegistry,
} from "@my-app/api/payments/webhooks/registry";
import type { PaymentWebhookAdapter } from "@my-app/api/payments/webhooks/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route under test delegates to internalServerRouteProcedures which calls
// the real adapter registry. We register stub adapters per-test instead of
// mocking the module, so this test works under both Vitest and Bun.

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

	it("returns 200 with code 0 for successful processing", async () => {
		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/check",
			{ method: "POST" }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ code: 0 });
	});

	it("returns 500 with code 1 on processing error", async () => {
		stubAdapter = createStubAdapter({
			processWebhook: vi.fn().mockRejectedValue(new Error("DB error")),
		});
		registerPaymentWebhookAdapter(stubAdapter);

		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		const response = await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/pay",
			{ method: "POST" }
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ code: 1 });
	});

	it("passes correct webhook type to adapter", async () => {
		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		for (const type of [
			"check",
			"pay",
			"fail",
			"confirm",
			"refund",
			"cancel",
		]) {
			(stubAdapter.processWebhook as ReturnType<typeof vi.fn>).mockClear();
			(
				stubAdapter.parseWebhookBody as ReturnType<typeof vi.fn>
			).mockResolvedValue(sampleNotification);
			(
				stubAdapter.processWebhook as ReturnType<typeof vi.fn>
			).mockResolvedValue({ code: 0 });

			await paymentWebhookRoutes.request(
				`/api/payments/webhook/cloudpayments/${type}`,
				{ method: "POST" }
			);

			expect(stubAdapter.processWebhook).toHaveBeenCalledWith(
				type,
				sampleNotification
			);
		}
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
