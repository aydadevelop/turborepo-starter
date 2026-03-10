import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	CloudPaymentsPaymentProvider,
	createCloudPaymentsPaymentProvider,
	getPaymentProvider,
	registerPaymentProvider,
	resetPaymentProviderRegistry,
	type PaymentExecutionConfig,
	type PaymentProvider,
	type RefundPaymentInput,
} from "..";

const refundInput: RefundPaymentInput = {
	amountCents: 12_345,
	providerPaymentId: "txn-123",
	currency: "RUB",
	idempotencyKey: "refund:txn-123",
};

const executionConfig: PaymentExecutionConfig = {
	providerId: "cloudpayments",
	publicKey: "pk_test",
	credentialKeyVersion: 1,
	credentials: {
		apiSecret: "secret_test",
	},
};

const createTestProvider = (
	overrides: Partial<PaymentProvider> = {},
): PaymentProvider => ({
	providerId: "cloudpayments",
	refundPayment: vi.fn().mockResolvedValue({ externalRefundId: "refund-123" }),
	...overrides,
});

describe("payment provider registry", () => {
	beforeEach(() => {
		resetPaymentProviderRegistry();
	});

	it("resolves a registered provider and preserves the refund contract shape", async () => {
		const provider = createTestProvider();
		registerPaymentProvider(provider);

		const resolved = getPaymentProvider("cloudpayments");
		const result = await resolved.refundPayment(refundInput, executionConfig);

		expect(resolved).toBe(provider);
		expect(result).toEqual({ externalRefundId: "refund-123" });
		expect(provider.refundPayment).toHaveBeenCalledWith(
			refundInput,
			executionConfig,
		);
	});

	it("throws a clear error when a provider is missing", () => {
		expect(() => getPaymentProvider("cloudpayments")).toThrow(
			'PaymentProvider "cloudpayments" is not registered. Call registerPaymentProvider() at startup.',
		);
	});

	it("reset clears the registry between tests", () => {
		registerPaymentProvider(createTestProvider());
		resetPaymentProviderRegistry();

		expect(() => getPaymentProvider("cloudpayments")).toThrow(
			'PaymentProvider "cloudpayments" is not registered. Call registerPaymentProvider() at startup.',
		);
	});
});

const makeJsonResponse = (
	body: unknown,
	init: ResponseInit = { status: 200 },
): Response =>
	new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText,
		headers: {
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});

describe("CloudPaymentsPaymentProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("executes a refund using org-scoped runtime credentials and returns an external refund id", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			makeJsonResponse({
				Success: true,
				Message: null,
				Model: { TransactionId: 568 },
			}),
		);
		const provider = createCloudPaymentsPaymentProvider({ fetch: fetchMock });

		const result = await provider.refundPayment(
			{
				amountCents: 10_000,
				providerPaymentId: "455",
				currency: "RUB",
				idempotencyKey: "refund-request-1",
			},
			{
				providerId: "cloudpayments",
				publicKey: "pk_live_test",
				credentials: { apiSecret: "secret_live_test" },
			},
		);

		expect(result).toEqual({ externalRefundId: "568" });
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.cloudpayments.ru/payments/refund");
		expect(request.method).toBe("POST");
		expect(request.headers).toMatchObject({
			Authorization: `Basic ${Buffer.from("pk_live_test:secret_live_test").toString("base64")}`,
			"Content-Type": "application/json",
			"X-Request-ID": "refund-request-1",
		});
		expect(JSON.parse(String(request.body))).toEqual({
			TransactionId: 455,
			Amount: 100,
		});
	});

	it("preserves integer-cent boundaries until the adapter converts them for the provider", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			makeJsonResponse({
				Success: true,
				Message: null,
				Model: { TransactionId: 569 },
			}),
		);
		const provider = new CloudPaymentsPaymentProvider({ fetch: fetchMock });
		const preciseInput: RefundPaymentInput = {
			amountCents: 10_001,
			providerPaymentId: "456",
			currency: "RUB",
			idempotencyKey: "refund-request-2",
		};

		await provider.refundPayment(preciseInput, {
			providerId: "cloudpayments",
			publicKey: "pk_live_test",
			credentials: { apiSecret: "secret_live_test" },
		});

		const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(preciseInput.amountCents).toBe(10_001);
		expect(JSON.parse(String(request.body))).toEqual({
			TransactionId: 456,
			Amount: 100.01,
		});
	});

	it("throws an explicit error for malformed credential blobs", async () => {
		const provider = new CloudPaymentsPaymentProvider({
			fetch: vi.fn(),
		});

		await expect(
			provider.refundPayment(
				{
					amountCents: 5_000,
					providerPaymentId: "455",
					currency: "RUB",
					idempotencyKey: "refund-request-3",
				},
				{
					providerId: "cloudpayments",
					credentials: {},
				},
			),
		).rejects.toThrow("CLOUDPAYMENTS_INVALID_CONFIG: missing public key");
	});

	it("throws an explicit error for non-200 HTTP responses", async () => {
		const provider = new CloudPaymentsPaymentProvider({
			fetch: vi.fn().mockResolvedValue(
				new Response("upstream unavailable", {
					status: 503,
					statusText: "Service Unavailable",
				}),
			),
		});

		await expect(
			provider.refundPayment(
				{
					amountCents: 5_000,
					providerPaymentId: "455",
					currency: "RUB",
					idempotencyKey: "refund-request-4",
				},
				{
					providerId: "cloudpayments",
					publicKey: "pk_live_test",
					credentials: { apiSecret: "secret_live_test" },
				},
			),
		).rejects.toThrow(
			"CLOUDPAYMENTS_HTTP_ERROR: 503 Service Unavailable: upstream unavailable",
		);
	});

	it("throws an explicit error when CloudPayments returns Success false", async () => {
		const provider = new CloudPaymentsPaymentProvider({
			fetch: vi.fn().mockResolvedValue(
				makeJsonResponse({
					Success: false,
					Message: "Invalid Amount value",
					Model: null,
				}),
			),
		});

		await expect(
			provider.refundPayment(
				{
					amountCents: 5_000,
					providerPaymentId: "455",
					currency: "RUB",
					idempotencyKey: "refund-request-5",
				},
				{
					providerId: "cloudpayments",
					publicKey: "pk_live_test",
					credentials: { apiSecret: "secret_live_test" },
				},
			),
		).rejects.toThrow(
			"CLOUDPAYMENTS_REFUND_FAILED: Invalid Amount value",
		);
	});
});