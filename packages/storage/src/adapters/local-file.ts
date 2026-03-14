import path from "node:path";
import type {
	StorageProvider,
	StorageSignedUploadInput,
	StorageSignedUploadResult,
	StorageUploadInput,
	StorageUploadResult,
} from "../provider";
import {
	buildObjectUrl,
	createStorageObjectKey,
	normalizeStorageKey,
	readStorageFile,
	removeStorageFile,
	toBuffer,
	writeStorageFile,
} from "../utils";

export interface LocalFileStorageProviderOptions {
	baseDir: string;
	providerId: string;
	publicBaseUrl?: string;
}

const buildPrivateDownloadUrl = (
	providerId: string,
	key: string,
	expiresInSeconds: number,
): string => {
	const url = new URL(
		`local-file://${encodeURIComponent(providerId)}/${normalizeStorageKey(key)}`,
	);
	url.searchParams.set("expires", String(expiresInSeconds));
	return url.toString();
};

export const createLocalFileStorageProvider = (
	options: LocalFileStorageProviderOptions,
): StorageProvider => {
	const upload = async (
		input: StorageUploadInput,
	): Promise<StorageUploadResult> => {
		const key = input.key
			? normalizeStorageKey(input.key)
			: createStorageObjectKey({
					filename: input.filename,
					prefix: input.prefix,
				});
		await writeStorageFile(options.baseDir, key, toBuffer(input.content));
		return {
			key,
			access: input.access,
			publicUrl:
				input.access === "public" && options.publicBaseUrl
					? buildObjectUrl(options.publicBaseUrl, key)
					: null,
		};
	};

	const getSignedUploadUrl = (
		input: StorageSignedUploadInput,
	): Promise<StorageSignedUploadResult> => {
		const key = input.key
			? normalizeStorageKey(input.key)
			: createStorageObjectKey({
					filename: input.filename,
					prefix: input.prefix,
				});
		const expiresInSeconds = input.expiresInSeconds ?? 900;

		return Promise.resolve({
			key,
			access: input.access,
			expiresInSeconds,
			publicUrl:
				input.access === "public" && options.publicBaseUrl
					? buildObjectUrl(options.publicBaseUrl, key)
					: null,
			url: buildPrivateDownloadUrl(options.providerId, key, expiresInSeconds),
			headers: input.mimeType ? { "content-type": input.mimeType } : undefined,
		});
	};

	return {
		providerId: options.providerId,
		upload,
		async deleteObject(ref) {
			await removeStorageFile(options.baseDir, ref.key);
		},
		getPublicUrl(ref) {
			if (ref.access !== "public" || !options.publicBaseUrl) {
				return null;
			}

			return buildObjectUrl(options.publicBaseUrl, ref.key);
		},
		getSignedDownloadUrl(ref, options_) {
			if (ref.access === "public" && options.publicBaseUrl) {
				return Promise.resolve(buildObjectUrl(options.publicBaseUrl, ref.key));
			}

			return Promise.resolve(
				buildPrivateDownloadUrl(
					options.providerId,
					ref.key,
					options_?.expiresInSeconds ?? 900,
				),
			);
		},
		getSignedUploadUrl,
		async getObjectBuffer(ref) {
			try {
				return await readStorageFile(options.baseDir, ref.key);
			} catch {
				throw new Error(`Storage object "${ref.key}" was not found.`);
			}
		},
	};
};

export const resolveLocalStoragePath = (
	baseDir: string,
	key: string,
): string => {
	return path.join(baseDir, normalizeStorageKey(key));
};
