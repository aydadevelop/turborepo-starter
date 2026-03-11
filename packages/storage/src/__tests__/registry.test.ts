import { afterEach, describe, expect, it } from "vitest";
import {
	createFakeStorageProvider,
	getSignedObjectUploadUrl,
	registerStorageProvider,
	resetStorageProviderRegistry,
	resolvePublicObjectUrl,
	uploadObject,
} from "../index";

afterEach(() => {
	resetStorageProviderRegistry();
});

describe("storage registry", () => {
	it("routes operations through the registered provider", async () => {
		const provider = createFakeStorageProvider({
			providerId: "test-provider",
		});
		registerStorageProvider(provider);

		const uploaded = await uploadObject("test-provider", {
			filename: "images/example.jpg",
			content: Buffer.from("hello world"),
			access: "public",
		});

		expect(uploaded.key).toMatch(/^images\/example-[a-f0-9]+\.jpg$/);
		expect(resolvePublicObjectUrl("test-provider", uploaded)).toBe(
			uploaded.publicUrl,
		);

		const signedUpload = await getSignedObjectUploadUrl("test-provider", {
			filename: "images/second.jpg",
			access: "private",
		});
		expect(signedUpload.url).toContain("signature=fake");
	});

	it("throws a descriptive error when a provider is missing", async () => {
		expect(() =>
			uploadObject("missing-provider", {
				filename: "x.txt",
				content: Buffer.from("x"),
				access: "public",
			}),
		).toThrow('StorageProvider "missing-provider" is not registered');
	});
});
