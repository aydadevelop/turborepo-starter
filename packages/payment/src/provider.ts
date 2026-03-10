export type PaymentProviderId = "cloudpayments" | "stripe";

export interface PaymentExecutionConfig {
	providerId: PaymentProviderId;
	publicKey?: string;
	credentialKeyVersion?: number;
	credentials: Record<string, unknown>;
}

export interface RefundPaymentInput {
	amountCents: number;
	providerPaymentId: string;
	currency: string;
	idempotencyKey: string;
}

export interface RefundPaymentResult {
	externalRefundId: string;
}

export interface PaymentProvider {
	readonly providerId: PaymentProviderId;

	refundPayment(
		input: RefundPaymentInput,
		config: PaymentExecutionConfig,
	): Promise<RefundPaymentResult>;
}