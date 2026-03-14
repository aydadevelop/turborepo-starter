import type { PaymentProvider, PaymentWebhookAdapter } from "./types";

const adapterRegistry = new Map<PaymentProvider, PaymentWebhookAdapter>();

export const registerPaymentWebhookAdapter = (
	adapter: PaymentWebhookAdapter
) => {
	adapterRegistry.set(adapter.provider, adapter);
};

export const getPaymentWebhookAdapter = (
	provider: string
): PaymentWebhookAdapter | null => {
	return adapterRegistry.get(provider as PaymentProvider) ?? null;
};

export const resetPaymentWebhookRegistry = () => {
	adapterRegistry.clear();
};
