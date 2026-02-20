import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CloudPaymentsWebhookAdapter } from "../payments/webhooks/cloudpayments";
import {
	WebhookAuthError,
	WebhookPayloadError,
} from "../payments/webhooks/errors";

const adapter = new CloudPaymentsWebhookAdapter({
	publicId: "pk_test",
	apiSecret: "api_secret",
});

const sampleNotification = {
	TransactionId: 12_345,
	Amount: 1000,
	Currency: "USD",
	Status: "Completed",
};

describe("CloudPaymentsWebhookAdapter.authenticateWebhook", () => {
	it("accepts valid Basic Auth credentials", () => {
		const credentials = btoa("pk_test:api_secret");
		const request = new Request("https://example.com/webhook", {
			headers: { Authorization: `Basic ${credentials}` },
		});

		expect(() => adapter.authenticateWebhook(request)).not.toThrow();
	});

	it("rejects invalid Basic Auth credentials", () => {
		const credentials = btoa("pk_test:wrong_secret");
		const request = new Request("https://example.com/webhook", {
			headers: { Authorization: `Basic ${credentials}` },
		});

		expect(() => adapter.authenticateWebhook(request)).toThrow(
			WebhookAuthError
		);
	});

	it("accepts Content-HMAC header as fallback auth", () => {
		const request = new Request("https://example.com/webhook", {
			headers: { "Content-HMAC": "some-hmac-value" },
		});

		expect(() => adapter.authenticateWebhook(request)).not.toThrow();
	});

	it("rejects missing authentication", () => {
		const request = new Request("https://example.com/webhook");

		expect(() => adapter.authenticateWebhook(request)).toThrow(
			WebhookAuthError
		);
	});
});

describe("CloudPaymentsWebhookAdapter.parseWebhookBody", () => {
	it("parses JSON body", async () => {
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(sampleNotification),
		});

		const result = await adapter.parseWebhookBody(request);

		expect(result).toMatchObject(sampleNotification);
	});

	it("parses form-urlencoded body with numeric coercion", async () => {
		const params = new URLSearchParams({
			TransactionId: "12345",
			Amount: "1000",
			Currency: "USD",
			Status: "Completed",
		});

		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params.toString(),
		});

		const result = await adapter.parseWebhookBody(request);

		expect(result.TransactionId).toBe(12_345);
		expect(result.Amount).toBe(1000);
		expect(result.Currency).toBe("USD");
	});

	it("rejects unsupported Content-Type", async () => {
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: "hello",
		});

		await expect(adapter.parseWebhookBody(request)).rejects.toThrow(
			WebhookPayloadError
		);
	});
});

describe("CloudPaymentsWebhookAdapter.processWebhook", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns { code: 0 } for supported webhook types", async () => {
		for (const type of [
			"check",
			"pay",
			"fail",
			"confirm",
			"refund",
			"cancel",
		]) {
			const result = await adapter.processWebhook(type, sampleNotification);
			expect(result).toEqual({ code: 0 });
		}
	});
});
