import type { EmailProvider } from "./provider";

const emailProviderRegistry = new Map<string, EmailProvider>();

export const registerEmailProvider = (provider: EmailProvider): void => {
	emailProviderRegistry.set(provider.providerId, provider);
};

export const getEmailProvider = (providerId: string): EmailProvider => {
	const provider = emailProviderRegistry.get(providerId);
	if (!provider) {
		throw new Error(
			`EmailProvider "${providerId}" is not registered. Call registerEmailProvider() at startup.`,
		);
	}

	return provider;
};

export const resetEmailProviderRegistry = (): void => {
	emailProviderRegistry.clear();
};
