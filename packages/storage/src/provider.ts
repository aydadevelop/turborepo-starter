export const storageAccessValues = ["public", "private"] as const;

export type StorageAccess = (typeof storageAccessValues)[number];

export interface StorageObjectRef {
	access: StorageAccess;
	key: string;
}

export interface StorageUploadInput {
	access: StorageAccess;
	content: ArrayBuffer | Buffer | Uint8Array;
	filename: string;
	key?: string;
	mimeType?: string;
	prefix?: string;
}

export interface StorageUploadResult extends StorageObjectRef {
	publicUrl: string | null;
}

export interface StorageSignedUrlOptions {
	expiresInSeconds?: number;
	filename?: string;
}

export interface StorageSignedUploadInput {
	access: StorageAccess;
	expiresInSeconds?: number;
	filename: string;
	key?: string;
	mimeType?: string;
	prefix?: string;
}

export interface StorageSignedUploadResult extends StorageObjectRef {
	expiresInSeconds: number;
	headers?: Record<string, string>;
	publicUrl: string | null;
	url: string;
}

export interface StorageProvider {
	readonly providerId: string;

	deleteObject(ref: StorageObjectRef): Promise<void>;

	getObjectBuffer?(ref: StorageObjectRef): Promise<Buffer>;

	getPublicUrl(ref: StorageObjectRef): string | null;

	getSignedDownloadUrl(
		ref: StorageObjectRef,
		options?: StorageSignedUrlOptions,
	): Promise<string>;

	getSignedUploadUrl?(
		input: StorageSignedUploadInput,
	): Promise<StorageSignedUploadResult>;

	upload(input: StorageUploadInput): Promise<StorageUploadResult>;
}
