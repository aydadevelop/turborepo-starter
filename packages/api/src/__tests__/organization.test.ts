import { describe, expect, it } from "vitest";

import { hasOrganizationPermission } from "../organization";

describe("organization permissions", () => {
	it("allows org_owner to update organization", () => {
		const isAllowed = hasOrganizationPermission("org_owner", {
			organization: ["update"],
		});

		expect(isAllowed).toBe(true);
	});

	it("does not allow manager to delete organization", () => {
		const isAllowed = hasOrganizationPermission("manager", {
			organization: ["delete"],
		});

		expect(isAllowed).toBe(false);
	});

	it("rejects unknown roles", () => {
		const isAllowed = hasOrganizationPermission("unknown_role", {
			organization: ["update"],
		});

		expect(isAllowed).toBe(false);
	});

	it("allows org_admin to create boats", () => {
		const isAllowed = hasOrganizationPermission("org_admin", {
			boat: ["create"],
		});

		expect(isAllowed).toBe(true);
	});
});
