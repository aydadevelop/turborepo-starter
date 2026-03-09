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

describe("listing resource permissions", () => {
	it("allows org_owner to create listing", () => {
		const result = organizationRoles.org_owner.authorize({
			listing: ["create"],
		});

		expect(result.success).toBe(true);
	});

	it("allows org_owner to delete listing", () => {
		const result = organizationRoles.org_owner.authorize({
			listing: ["delete"],
		});

		expect(result.success).toBe(true);
	});

	it("allows org_admin to update listing", () => {
		const result = organizationRoles.org_admin.authorize({
			listing: ["update"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow manager to delete listing", () => {
		const result = organizationRoles.manager.authorize({
			listing: ["delete"],
		});

		expect(result.success).toBe(false);
	});

	it("allows manager to create listing", () => {
		const result = organizationRoles.manager.authorize({
			listing: ["create"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow agent to create listing", () => {
		const result = organizationRoles.agent.authorize({
			listing: ["create"],
		});

		expect(result.success).toBe(false);
	});

	it("allows agent to read listing", () => {
		const result = organizationRoles.agent.authorize({
			listing: ["read"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow customer any listing permissions", () => {
		const result = organizationRoles.customer.authorize({
			listing: ["read"],
		});

		expect(result.success).toBe(false);
	});
});
