import { createHmac } from "node:crypto";
import { CloudPaymentsWebhookAdapter } from "@my-app/payment/webhooks/cloudpayments/index";
import {
	WebhookAuthError,
	WebhookPayloadError,
} from "@my-app/payment/webhooks/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const createRequestHmac = (body: string) =>
	createHmac("sha256", "api_secret").update(body, "utf8").digest("base64");

describe("CloudPaymentsWebhookAdapter.authenticateWebhook", () => {
	it("accepts valid Basic Auth credentials", async () => {
		const credentials = btoa("pk_test:api_secret");
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { Authorization: `Basic ${credentials}` },
		});

		await expect(adapter.authenticateWebhook(request)).resolves.toBeUndefined();
	});

	it("rejects invalid Basic Auth credentials", async () => {
		const credentials = btoa("pk_test:wrong_secret");
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { Authorization: `Basic ${credentials}` },
		});

		await expect(adapter.authenticateWebhook(request)).rejects.toThrow(
			WebhookAuthError,
		);
	});

	it("rejects invalid HMAC headers", async () => {
		const body = JSON.stringify(sampleNotification);
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-HMAC": "not-the-right-hash",
			},
			body,
		});

		await expect(adapter.authenticateWebhook(request)).rejects.toThrow(
			WebhookAuthError,
		);
	});

	it("accepts a valid computed HMAC header without consuming the body", async () => {
		const body = JSON.stringify(sampleNotification);
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Content-HMAC": createRequestHmac(body),
			},
			body,
		});

		await expect(adapter.authenticateWebhook(request)).resolves.toBeUndefined();
		await expect(adapter.parseWebhookBody(request)).resolves.toMatchObject(
			sampleNotification,
		);
	});

	it("accepts Basic Auth as an alternative authentication path", async () => {
		const credentials = btoa("pk_test:api_secret");
		const body = JSON.stringify(sampleNotification);
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: {
				Authorization: `Basic ${credentials}`,
				"Content-Type": "application/json",
			},
			body,
		});

		await expect(adapter.authenticateWebhook(request)).resolves.toBeUndefined();
	});

	it("rejects missing authentication", async () => {
		const request = new Request("https://example.com/webhook");

		await expect(adapter.authenticateWebhook(request)).rejects.toThrow(
			WebhookAuthError,
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
			WebhookPayloadError,
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
