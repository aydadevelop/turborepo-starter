import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3StorageProvider, type StorageProvider } from "../index";

const requiredEnv = [
	"STORAGE_S3_CONTRACT_ENDPOINT",
	"STORAGE_S3_CONTRACT_REGION",
	"STORAGE_S3_CONTRACT_BUCKET",
	"STORAGE_S3_CONTRACT_ACCESS_KEY_ID",
	"STORAGE_S3_CONTRACT_SECRET_ACCESS_KEY",
	"STORAGE_S3_CONTRACT_PUBLIC_BASE_URL",
] as const;

const hasContractEnv = requiredEnv.every((key) => {
	const value = process.env[key];
	return typeof value === "string" && value.length > 0;
});

describe.skipIf(!hasContractEnv)("s3 storage provider contract", () => {
	let provider: StorageProvider;

	beforeAll(() => {
		provider = createS3StorageProvider({
			providerId: "contract-s3",
			endpoint: process.env.STORAGE_S3_CONTRACT_ENDPOINT,
			region: process.env.STORAGE_S3_CONTRACT_REGION ?? "us-east-1",
			bucket: process.env.STORAGE_S3_CONTRACT_BUCKET ?? "",
			accessKeyId: process.env.STORAGE_S3_CONTRACT_ACCESS_KEY_ID,
			secretAccessKey: process.env.STORAGE_S3_CONTRACT_SECRET_ACCESS_KEY,
			publicBaseUrl: process.env.STORAGE_S3_CONTRACT_PUBLIC_BASE_URL ?? "",
			forcePathStyle: process.env.STORAGE_S3_CONTRACT_FORCE_PATH_STYLE === "1",
		});
	});

	afterAll(async () => {
		if (!provider) {
			return;
		}
	});

	it("uploads, signs, fetches, and deletes a file", async () => {
		const uploaded = await provider.upload({
			filename: "contracts/test-object.txt",
			content: Buffer.from("contract-test"),
			access: "public",
			mimeType: "text/plain",
		});

		expect(uploaded.publicUrl).toBeTruthy();

		const signedDownloadUrl = await provider.getSignedDownloadUrl(uploaded);
		const response = await fetch(signedDownloadUrl);
		expect(response.ok).toBe(true);
		expect(await response.text()).toBe("contract-test");

		await provider.deleteObject(uploaded);
	});

	it("creates a signed upload url", async () => {
		const signedUpload = await provider.getSignedUploadUrl?.({
			filename: "contracts/upload-via-signed-url.txt",
			access: "private",
			mimeType: "text/plain",
		});

		expect(signedUpload?.url).toBeTruthy();
		expect(signedUpload?.headers?.["content-type"]).toBe("text/plain");

		const uploadResponse = await fetch(signedUpload!.url, {
			method: "PUT",
			headers: signedUpload!.headers,
			body: "signed-upload",
		});
		expect(uploadResponse.ok).toBe(true);

		const signedDownloadUrl = await provider.getSignedDownloadUrl({
			key: signedUpload!.key,
			access: "private",
		});
		const downloadResponse = await fetch(signedDownloadUrl);
		expect(downloadResponse.ok).toBe(true);
		expect(await downloadResponse.text()).toBe("signed-upload");

		await provider.deleteObject({
			key: signedUpload!.key,
			access: "private",
		});
	});
});
