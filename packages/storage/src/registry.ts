import type {
	StorageObjectRef,
	StorageProvider,
	StorageSignedUploadInput,
	StorageSignedUploadResult,
	StorageSignedUrlOptions,
	StorageUploadInput,
	StorageUploadResult,
} from "./provider";

const storageProviderRegistry = new Map<string, StorageProvider>();

export const registerStorageProvider = (provider: StorageProvider): void => {
	storageProviderRegistry.set(provider.providerId, provider);
};

export const getStorageProvider = (providerId: string): StorageProvider => {
	const provider = storageProviderRegistry.get(providerId);
	if (!provider) {
		throw new Error(
			`StorageProvider "${providerId}" is not registered. Call registerStorageProvider() at startup.`,
		);
	}

	return provider;
};

export const resetStorageProviderRegistry = (): void => {
	storageProviderRegistry.clear();
};

export const uploadObject = (
	providerId: string,
	input: StorageUploadInput,
): Promise<StorageUploadResult> => {
	return getStorageProvider(providerId).upload(input);
};

export const deleteObject = (
	providerId: string,
	ref: StorageObjectRef,
): Promise<void> => {
	return getStorageProvider(providerId).deleteObject(ref);
};

export const resolvePublicObjectUrl = (
	providerId: string,
	ref: StorageObjectRef,
): string | null => {
	return getStorageProvider(providerId).getPublicUrl(ref);
};

export const getSignedObjectDownloadUrl = (
	providerId: string,
	ref: StorageObjectRef,
	options?: StorageSignedUrlOptions,
): Promise<string> => {
	return getStorageProvider(providerId).getSignedDownloadUrl(ref, options);
};

export const getSignedObjectUploadUrl = async (
	providerId: string,
	input: StorageSignedUploadInput,
): Promise<StorageSignedUploadResult> => {
	const provider = getStorageProvider(providerId);
	if (!provider.getSignedUploadUrl) {
		throw new Error(
			`StorageProvider "${providerId}" does not support signed upload URLs.`,
		);
	}

	return provider.getSignedUploadUrl(input);
};
