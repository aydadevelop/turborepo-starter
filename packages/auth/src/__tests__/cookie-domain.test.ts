import { describe, expect, it } from "vitest";

import { derivePasskeyRpId, deriveSharedCookieDomain } from "../cookie-domain";

describe("deriveSharedCookieDomain", () => {
	it("derives the shared parent domain for api subdomains", () => {
		expect(deriveSharedCookieDomain("api.staging.ayda.studio")).toBe(
			"staging.ayda.studio",
		);
	});

	it("keeps workers.dev shared cookie domains", () => {
		expect(deriveSharedCookieDomain("api.demo.workers.dev")).toBe(
			"demo.workers.dev",
		);
	});

	it("does not force parent-domain cookies for public tunnel hosts", () => {
		expect(
			deriveSharedCookieDomain(
				"capital-gibbon-definite.ngrok-free.app",
			),
		).toBeNull();
	});

	it("does not derive a shared domain for localhost", () => {
		expect(deriveSharedCookieDomain("localhost")).toBeNull();
	});
});

describe("derivePasskeyRpId", () => {
	it("uses localhost directly for local development", () => {
		expect(derivePasskeyRpId("localhost")).toBe("localhost");
	});

	it("uses workers.dev shared origin when present", () => {
		expect(derivePasskeyRpId("api.demo.workers.dev")).toBe(
			"demo.workers.dev",
		);
	});

	it("keeps tunnel hosts unchanged", () => {
		expect(derivePasskeyRpId("capital-gibbon-definite.ngrok-free.app")).toBe(
			"capital-gibbon-definite.ngrok-free.app",
		);
	});
});