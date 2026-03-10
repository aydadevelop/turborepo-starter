import { beforeEach, describe, expect, it, vi } from "vitest";

import {
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