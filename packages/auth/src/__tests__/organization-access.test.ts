import { describe, expect, it } from "vitest";

import { organizationRoles } from "../organization-access";

describe("organization access roles", () => {
	it("allows org_owner to delete organization", () => {
		const result = organizationRoles.org_owner.authorize({
			organization: ["delete"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow manager to delete organization", () => {
		const result = organizationRoles.manager.authorize({
			organization: ["delete"],
		});

		expect(result.success).toBe(false);
	});

	it("allows agent to create invitation", () => {
		const result = organizationRoles.agent.authorize({
			invitation: ["create"],
		});

		expect(result.success).toBe(true);
	});

	it("allows manager to update boats", () => {
		const result = organizationRoles.manager.authorize({
			boat: ["update"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow customer to create boats", () => {
		const result = organizationRoles.customer.authorize({
			boat: ["create"],
		});

		expect(result.success).toBe(false);
	});
});
