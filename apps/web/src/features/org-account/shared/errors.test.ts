import { describe, expect, it } from "vitest";
import { formatOrgAccountError } from "./errors";

describe("formatOrgAccountError", () => {
	it("prefers nested auth-style error messages", () => {
		expect(
			formatOrgAccountError(
				{ error: { message: "Invitation already exists." } },
				"fallback"
			)
		).toBe("Invitation already exists.");
	});

	it("uses Error messages when present", () => {
		expect(formatOrgAccountError(new Error("No access."), "fallback")).toBe(
			"No access."
		);
	});

	it("falls back when no useful message is present", () => {
		expect(formatOrgAccountError({}, "fallback")).toBe("fallback");
	});
});
