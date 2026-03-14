import { afterEach, describe, expect, it } from "vitest";
import {
	createFakeStorageProvider,
	getSignedObjectUploadUrl,
	registerStorageProvider,
	resetStorageProviderRegistry,
	resolvePublicObjectUrl,
	uploadObject,
} from "../index";

const REGISTRY_PUBLIC_KEY_RE = /^images\/example-[a-f0-9]+\.jpg$/;

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

		expect(uploaded.key).toMatch(REGISTRY_PUBLIC_KEY_RE);
		expect(resolvePublicObjectUrl("test-provider", uploaded)).toBe(
			uploaded.publicUrl,
		);

		const signedUpload = await getSignedObjectUploadUrl("test-provider", {
			filename: "images/second.jpg",
			access: "private",
		});
		expect(signedUpload.url).toContain("signature=fake");
	});

	it("throws a descriptive error when a provider is missing", () => {
		expect(() =>
			uploadObject("missing-provider", {
				filename: "x.txt",
				content: Buffer.from("x"),
				access: "public",
			}),
		).toThrow('StorageProvider "missing-provider" is not registered');
	});
});
