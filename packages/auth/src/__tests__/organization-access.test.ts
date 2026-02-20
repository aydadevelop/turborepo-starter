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

	it("allows manager to update tasks", () => {
		const result = organizationRoles.manager.authorize({
			task: ["update"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow customer to create payments", () => {
		const result = organizationRoles.customer.authorize({
			payment: ["create"],
		});

		expect(result.success).toBe(false);
	});

	it("allows agent to create support tickets", () => {
		const result = organizationRoles.agent.authorize({
			support: ["create"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow customer to create notifications", () => {
		const result = organizationRoles.customer.authorize({
			notification: ["create"],
		});

		expect(result.success).toBe(false);
	});

	it("allows manager to update support tickets", () => {
		const result = organizationRoles.manager.authorize({
			support: ["update"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow customer to create notifications", () => {
		const result = organizationRoles.customer.authorize({
			notification: ["create"],
		});

		expect(result.success).toBe(false);
	});
});
