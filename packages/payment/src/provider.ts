export type PaymentProviderId = "cloudpayments" | "stripe";

export interface PaymentExecutionConfig {
	credentialKeyVersion?: number;
	credentials: Record<string, unknown>;
	providerId: PaymentProviderId;
	publicKey?: string;
}

export interface RefundPaymentInput {
	amountCents: number;
	currency: string;
	idempotencyKey: string;
	providerPaymentId: string;
}

export interface RefundPaymentResult {
	externalRefundId: string;
}

export interface PaymentProvider {
	readonly providerId: PaymentProviderId;

	refundPayment(
		input: RefundPaymentInput,
		config: PaymentExecutionConfig
	): Promise<RefundPaymentResult>;
}
