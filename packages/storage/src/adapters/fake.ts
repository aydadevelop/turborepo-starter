import type {
	StorageObjectRef,
	StorageProvider,
	StorageSignedUploadInput,
	StorageSignedUploadResult,
	StorageSignedUrlOptions,
	StorageUploadInput,
	StorageUploadResult,
} from "../provider";
import {
	buildObjectUrl,
	createStorageObjectKey,
	normalizeStorageKey,
	toBuffer,
} from "../utils";

interface FakeStorageProviderOptions {
	providerId: string;
	publicBaseUrl?: string;
}

export interface FakeStorageProvider extends StorageProvider {
	readonly files: Map<string, Buffer>;
}

const buildSignedUrl = (
	publicBaseUrl: string,
	key: string,
	action: "download" | "upload",
	expiresInSeconds: number
): string => {
	const url = new URL(buildObjectUrl(publicBaseUrl, key));
	url.searchParams.set("signature", "fake");
	url.searchParams.set("action", action);
	url.searchParams.set("expires", String(expiresInSeconds));
	return url.toString();
};

export const createFakeStorageProvider = (
	options: FakeStorageProviderOptions
): FakeStorageProvider => {
	const files = new Map<string, Buffer>();
	const publicBaseUrl =
		options.publicBaseUrl ??
		`https://storage.test/${encodeURIComponent(options.providerId)}`;

	const upload = (input: StorageUploadInput): Promise<StorageUploadResult> => {
		const key = input.key
			? normalizeStorageKey(input.key)
			: createStorageObjectKey({
					filename: input.filename,
					prefix: input.prefix,
				});
		files.set(key, toBuffer(input.content));
		return Promise.resolve({
			key,
			access: input.access,
			publicUrl:
				input.access === "public" ? buildObjectUrl(publicBaseUrl, key) : null,
		});
	};

	const getSignedUploadUrl = (
		input: StorageSignedUploadInput
	): Promise<StorageSignedUploadResult> => {
		const expiresInSeconds = input.expiresInSeconds ?? 900;
		const key = input.key
			? normalizeStorageKey(input.key)
			: createStorageObjectKey({
					filename: input.filename,
					prefix: input.prefix,
				});

		return Promise.resolve({
			key,
			access: input.access,
			expiresInSeconds,
			publicUrl:
				input.access === "public" ? buildObjectUrl(publicBaseUrl, key) : null,
			url: buildSignedUrl(publicBaseUrl, key, "upload", expiresInSeconds),
			headers: input.mimeType ? { "content-type": input.mimeType } : undefined,
		});
	};

	const getSignedDownloadUrl = (
		ref: StorageObjectRef,
		options?: StorageSignedUrlOptions
	): Promise<string> => {
		return Promise.resolve(
			buildSignedUrl(
				publicBaseUrl,
				ref.key,
				"download",
				options?.expiresInSeconds ?? 900
			)
		);
	};

	return {
		providerId: options.providerId,
		files,
		upload,
		deleteObject(ref) {
			files.delete(normalizeStorageKey(ref.key));
			return Promise.resolve();
		},
		getPublicUrl(ref) {
			return ref.access === "public"
				? buildObjectUrl(publicBaseUrl, ref.key)
				: null;
		},
		getSignedDownloadUrl,
		getSignedUploadUrl,
		getObjectBuffer(ref) {
			const buffer = files.get(normalizeStorageKey(ref.key));
			if (!buffer) {
				throw new Error(`Storage object "${ref.key}" was not found.`);
			}

			return Promise.resolve(buffer);
		},
	};
};
