import type { PaymentProvider, PaymentProviderId } from "./provider";

const paymentProviderRegistry = new Map<PaymentProviderId, PaymentProvider>();

export const registerPaymentProvider = (provider: PaymentProvider): void => {
	paymentProviderRegistry.set(provider.providerId, provider);
};

export const getPaymentProvider = (
	providerId: PaymentProviderId,
): PaymentProvider => {
	const provider = paymentProviderRegistry.get(providerId);
	if (!provider) {
		throw new Error(
			`PaymentProvider "${providerId}" is not registered. Call registerPaymentProvider() at startup.`,
		);
	}

	return provider;
};

export const resetPaymentProviderRegistry = (): void => {
	paymentProviderRegistry.clear();
};
