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

	it("allows agent to create bookings", () => {
		const result = organizationRoles.agent.authorize({
			booking: ["create"],
		});

		expect(result.success).toBe(true);
	});

	it("does not allow member to delete bookings", () => {
		const result = organizationRoles.member.authorize({
			booking: ["delete"],
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
