import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createLocalFileStorageProvider,
	resolveLocalStoragePath,
} from "../index";

const LOCAL_FILE_PUBLIC_KEY_RE = /^photos\/cabin-[a-f0-9]+\.jpg$/;
const STORAGE_NOT_FOUND_RE = /was not found/i;

describe("local file storage provider", () => {
	const createdDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			createdDirs
				.splice(0)
				.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("uploads, reads, resolves, and deletes a public file", async () => {
		const baseDir = await mkdtemp(path.join(os.tmpdir(), "storage-local-"));
		createdDirs.push(baseDir);
		const provider = createLocalFileStorageProvider({
			providerId: "listing-public-v1",
			baseDir,
			publicBaseUrl: "http://localhost:9334/listing-public-v1",
		});

		const uploaded = await provider.upload({
			filename: "photos/cabin.jpg",
			content: Buffer.from("image-bytes"),
			access: "public",
			mimeType: "image/jpeg",
		});

		expect(uploaded.key).toMatch(LOCAL_FILE_PUBLIC_KEY_RE);
		expect(uploaded.publicUrl).toBeTruthy();
		expect(provider.getPublicUrl(uploaded)).toBe(uploaded.publicUrl);

		const stored = await provider.getObjectBuffer?.(uploaded);
		expect(stored?.toString("utf8")).toBe("image-bytes");

		const signedUrl = await provider.getSignedDownloadUrl(uploaded);
		expect(signedUrl).toBe(uploaded.publicUrl);

		await provider.deleteObject(uploaded);

		await expect(provider.getObjectBuffer?.(uploaded)).rejects.toThrow(
			STORAGE_NOT_FOUND_RE,
		);
	});

	it("returns a local signed url for private objects", async () => {
		const baseDir = await mkdtemp(path.join(os.tmpdir(), "storage-local-"));
		createdDirs.push(baseDir);
		const provider = createLocalFileStorageProvider({
			providerId: "listing-private-v1",
			baseDir,
		});

		const uploaded = await provider.upload({
			filename: "docs/private.pdf",
			content: Buffer.from("pdf-bytes"),
			access: "private",
		});

		expect(provider.getPublicUrl(uploaded)).toBeNull();

		const signedUrl = await provider.getSignedDownloadUrl(uploaded, {
			expiresInSeconds: 60,
		});
		expect(signedUrl).toContain("local-file://listing-private-v1/");
		expect(resolveLocalStoragePath(baseDir, uploaded.key)).toContain(
			uploaded.key,
		);
	});
});
