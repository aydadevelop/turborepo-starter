import type { PaymentWebhookAdapter } from "@my-app/api/payments/webhooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registerMock = vi.fn();
const getAdapterMock = vi.fn();

vi.mock("@my-app/api/payments/webhooks", () => {
	class WebhookAuthError extends Error {
		constructor(msg: string) {
			super(msg);
			this.name = "WebhookAuthError";
		}
	}
	class WebhookPayloadError extends Error {
		constructor(msg: string) {
			super(msg);
			this.name = "WebhookPayloadError";
		}
	}
	return {
		getPaymentWebhookAdapter: getAdapterMock,
		registerPaymentWebhookAdapter: registerMock,
		WebhookAuthError,
		WebhookPayloadError,
	};
});

const sampleNotification = {
	TransactionId: 12_345,
	Amount: 1000,
	Currency: "RUB",
	Status: "Completed",
};

const createMockAdapter = (
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
	let mockAdapter: PaymentWebhookAdapter;

	beforeEach(() => {
		mockAdapter = createMockAdapter();
		getAdapterMock.mockReset();
		getAdapterMock.mockReturnValue(mockAdapter);
	});

	it("returns 404 for unknown provider", async () => {
		getAdapterMock.mockReturnValue(null);
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
		const { WebhookAuthError } = await import("@my-app/api/payments/webhooks");
		mockAdapter = createMockAdapter({
			authenticateWebhook: vi.fn(() => {
				throw new WebhookAuthError("Invalid credentials");
			}),
		});
		getAdapterMock.mockReturnValue(mockAdapter);

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
			"@my-app/api/payments/webhooks"
		);
		mockAdapter = createMockAdapter({
			parseWebhookBody: vi
				.fn()
				.mockRejectedValue(new WebhookPayloadError("Unsupported Content-Type")),
		});
		getAdapterMock.mockReturnValue(mockAdapter);

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
		mockAdapter = createMockAdapter({
			parseWebhookBody: vi.fn().mockRejectedValue(new Error("Unexpected")),
		});
		getAdapterMock.mockReturnValue(mockAdapter);

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
		mockAdapter = createMockAdapter({
			processWebhook: vi.fn().mockRejectedValue(new Error("DB error")),
		});
		getAdapterMock.mockReturnValue(mockAdapter);

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
			(mockAdapter.processWebhook as ReturnType<typeof vi.fn>).mockClear();
			(
				mockAdapter.parseWebhookBody as ReturnType<typeof vi.fn>
			).mockResolvedValue(sampleNotification);
			(
				mockAdapter.processWebhook as ReturnType<typeof vi.fn>
			).mockResolvedValue({ code: 0 });

			await paymentWebhookRoutes.request(
				`/api/payments/webhook/cloudpayments/${type}`,
				{ method: "POST" }
			);

			expect(mockAdapter.processWebhook).toHaveBeenCalledWith(
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

		expect(mockAdapter.authenticateWebhook).toHaveBeenCalledWith(
			expect.any(Request)
		);
	});

	it("looks up adapter by provider param", async () => {
		const { paymentWebhookRoutes } = await import("../routes/payment-webhook");

		await paymentWebhookRoutes.request(
			"/api/payments/webhook/cloudpayments/check",
			{ method: "POST" }
		);

		expect(getAdapterMock).toHaveBeenCalledWith("cloudpayments");
	});
});
