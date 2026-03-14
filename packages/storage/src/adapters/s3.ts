import type { Readable } from "node:stream";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
	readStreamToBuffer,
	toBuffer,
} from "../utils";

const DOUBLE_QUOTE_RE = /"/g;

export interface S3StorageProviderOptions {
	accessKeyId?: string;
	bucket: string;
	endpoint?: string;
	forcePathStyle?: boolean;
	providerId: string;
	publicBaseUrl: string;
	region: string;
	secretAccessKey?: string;
	signedUrlExpiresInSeconds?: number;
}

const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

export const createS3StorageProvider = (
	options: S3StorageProviderOptions
): StorageProvider => {
	const clientConfig: S3ClientConfig = {
		region: options.region,
		endpoint: options.endpoint,
		forcePathStyle: options.forcePathStyle,
	};

	if (options.accessKeyId && options.secretAccessKey) {
		clientConfig.credentials = {
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey,
		};
	}

	const client = new S3Client(clientConfig);

	const upload = async (
		input: StorageUploadInput
	): Promise<StorageUploadResult> => {
		const key = input.key
			? normalizeStorageKey(input.key)
			: createStorageObjectKey({
					filename: input.filename,
					prefix: input.prefix,
				});

		await client.send(
			new PutObjectCommand({
				Bucket: options.bucket,
				Key: key,
				Body: toBuffer(input.content),
				ContentType: input.mimeType,
			})
		);

		return {
			key,
			access: input.access,
			publicUrl:
				input.access === "public"
					? buildObjectUrl(options.publicBaseUrl, key)
					: null,
		};
	};

	const getSignedDownloadUrl = (
		ref: StorageObjectRef,
		options_?: StorageSignedUrlOptions
	): Promise<string> => {
		return getSignedUrl(
			client,
			new GetObjectCommand({
				Bucket: options.bucket,
				Key: normalizeStorageKey(ref.key),
				ResponseContentDisposition: options_?.filename
					? `inline; filename="${options_.filename.replace(DOUBLE_QUOTE_RE, "")}"`
					: undefined,
			}),
			{
				expiresIn:
					options_?.expiresInSeconds ??
					options.signedUrlExpiresInSeconds ??
					DEFAULT_SIGNED_URL_TTL_SECONDS,
			}
		);
	};

	const getSignedUploadUrl = async (
		input: StorageSignedUploadInput
	): Promise<StorageSignedUploadResult> => {
		const key = input.key
			? normalizeStorageKey(input.key)
			: createStorageObjectKey({
					filename: input.filename,
					prefix: input.prefix,
				});
		const expiresInSeconds =
			input.expiresInSeconds ??
			options.signedUrlExpiresInSeconds ??
			DEFAULT_SIGNED_URL_TTL_SECONDS;

		return {
			key,
			access: input.access,
			expiresInSeconds,
			publicUrl:
				input.access === "public"
					? buildObjectUrl(options.publicBaseUrl, key)
					: null,
			url: await getSignedUrl(
				client,
				new PutObjectCommand({
					Bucket: options.bucket,
					Key: key,
					ContentType: input.mimeType,
				}),
				{ expiresIn: expiresInSeconds }
			),
			headers: input.mimeType ? { "content-type": input.mimeType } : undefined,
		};
	};

	return {
		providerId: options.providerId,
		upload,
		async deleteObject(ref) {
			await client.send(
				new DeleteObjectCommand({
					Bucket: options.bucket,
					Key: normalizeStorageKey(ref.key),
				})
			);
		},
		getPublicUrl(ref) {
			return ref.access === "public"
				? buildObjectUrl(options.publicBaseUrl, ref.key)
				: null;
		},
		getSignedDownloadUrl,
		getSignedUploadUrl,
		async getObjectBuffer(ref) {
			const result = await client.send(
				new GetObjectCommand({
					Bucket: options.bucket,
					Key: normalizeStorageKey(ref.key),
				})
			);
			const body = result.Body;
			if (!body) {
				throw new Error(`Storage object "${ref.key}" returned an empty body.`);
			}
			if (
				"transformToByteArray" in body &&
				typeof body.transformToByteArray === "function"
			) {
				return Buffer.from(await body.transformToByteArray());
			}
			if (body instanceof ReadableStream) {
				return Buffer.from(await new Response(body).arrayBuffer());
			}
			return readStreamToBuffer(body as Readable);
		},
	};
};
