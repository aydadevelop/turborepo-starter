export const paymentProviderValues = ["cloudpayments"] as const;
export type PaymentProvider = (typeof paymentProviderValues)[number];

export interface PaymentWebhookResult {
	code: number;
}

export interface PaymentWebhookAdapter {
	readonly provider: PaymentProvider;
	readonly supportedWebhookTypes: ReadonlySet<string>;

	authenticateWebhook(request: Request): void;

	parseWebhookBody(request: Request): Promise<unknown>;

	processWebhook(
		webhookType: string,
		payload: unknown
	): Promise<PaymentWebhookResult>;
}
