export const paymentProviderValues = ["cloudpayments"] as const;
export type PaymentProvider = (typeof paymentProviderValues)[number];

export interface PaymentWebhookResult {
	code: number;
}

export interface PaymentWebhookAdapter {
	authenticateWebhook(request: Request): void | Promise<void>;

	parseWebhookBody(request: Request): Promise<unknown>;

	processWebhook(
		webhookType: string,
		payload: unknown,
	): Promise<PaymentWebhookResult>;
	readonly provider: PaymentProvider;
	readonly supportedWebhookTypes: ReadonlySet<string>;
}
