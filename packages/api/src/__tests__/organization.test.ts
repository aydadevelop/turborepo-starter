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

	it("allows manager to update tasks", () => {
		const isAllowed = hasOrganizationPermission("manager", {
			task: ["update"],
		});

		expect(isAllowed).toBe(true);
	});

	it("allows org_admin to create payments", () => {
		const isAllowed = hasOrganizationPermission("org_admin", {
			payment: ["create"],
		});

		expect(isAllowed).toBe(true);
	});

	it("rejects unknown roles", () => {
		const isAllowed = hasOrganizationPermission("unknown_role", {
			organization: ["update"],
		});

		expect(isAllowed).toBe(false);
	});
});
