import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const EMPTY_SEGMENT_FALLBACK = "file";

const sanitizePathSegment = (segment: string): string => {
	const normalized = segment
		.trim()
		.replace(/[^\p{L}\p{N}._-]+/gu, "-")
		.replace(/-+/g, "-")
		.replace(/^\.+/, "")
		.replace(/^[-_.]+|[-_.]+$/g, "");

	return normalized.length > 0 ? normalized : EMPTY_SEGMENT_FALLBACK;
};

export const normalizeStorageKey = (key: string): string => {
	const normalized = path.posix.normalize(key).replace(/^\/+/, "");
	const segments = normalized
		.split("/")
		.filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
		.map(sanitizePathSegment);

	if (segments.length === 0) {
		throw new Error("Storage key must contain at least one valid path segment.");
	}

	return segments.join("/");
};

export const createStorageObjectKey = (input: {
	filename: string;
	prefix?: string;
}): string => {
	const normalizedFilename = input.filename.replace(/\\/g, "/");
	const parsed = path.posix.parse(normalizedFilename);
	const directorySegments = parsed.dir
		.split("/")
		.filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
		.map(sanitizePathSegment);
	const fileStem = sanitizePathSegment(parsed.name || EMPTY_SEGMENT_FALLBACK);
	const extension = parsed.ext.replace(/[^.\p{L}\p{N}-]+/gu, "");
	const uniqueSuffix = crypto.randomUUID().replace(/-/g, "");
	const filename = `${fileStem}-${uniqueSuffix}${extension}`;
	const prefixSegments = input.prefix
		? normalizeStorageKey(input.prefix).split("/")
		: [];

	return [...prefixSegments, ...directorySegments, filename].join("/");
};

export const encodeStoragePath = (key: string): string => {
	return normalizeStorageKey(key)
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
};

export const buildObjectUrl = (
	baseUrl: string,
	key: string,
): string => {
	return `${baseUrl.replace(/\/+$/, "")}/${encodeStoragePath(key)}`;
};

export const toBuffer = (
	content: ArrayBuffer | Buffer | Uint8Array,
): Buffer => {
	if (Buffer.isBuffer(content)) {
		return content;
	}

	if (content instanceof Uint8Array) {
		return Buffer.from(content);
	}

	return Buffer.from(content);
};

export const readStorageFile = async (
	baseDir: string,
	key: string,
): Promise<Buffer> => {
	return readFile(path.join(baseDir, normalizeStorageKey(key)));
};

export const removeStorageFile = async (
	baseDir: string,
	key: string,
): Promise<void> => {
	const filePath = path.join(baseDir, normalizeStorageKey(key));
	await rm(filePath, { force: true });

	let currentDir = path.dirname(filePath);
	while (currentDir.startsWith(baseDir) && currentDir !== baseDir) {
		try {
			await rm(currentDir, { recursive: false });
		} catch {
			break;
		}
		currentDir = path.dirname(currentDir);
	}
};

export const writeStorageFile = async (
	baseDir: string,
	key: string,
	buffer: Buffer,
): Promise<void> => {
	const filePath = path.join(baseDir, normalizeStorageKey(key));
	await mkdir(path.dirname(filePath), { recursive: true });
	await new Promise<void>((resolve, reject) => {
		const stream = createWriteStream(filePath);
		stream.once("error", reject);
		stream.once("finish", resolve);
		stream.end(buffer);
	});
};

export const readStreamToBuffer = async (
	stream: Readable,
): Promise<Buffer> => {
	const chunks: Buffer[] = [];

	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	return Buffer.concat(chunks);
};
