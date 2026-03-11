import { describe, expect, it, vi } from "vitest";
import { submitInviteMember } from "./submit";

describe("submitInviteMember", () => {
	it("requires an organization id", async () => {
		const inviteMember = vi.fn();
		const invalidateMembership = vi.fn();

		const result = await submitInviteMember(
			{
				inviteMember,
				invalidateMembership,
			},
			{
				email: "captain@example.com",
				role: "agent",
				organizationId: "",
			}
		);

		expect(result).toEqual({
			ok: false,
			message: "Organization not found. Please try again.",
		});
		expect(inviteMember).not.toHaveBeenCalled();
	});

	it("returns a success message and invalidates membership queries", async () => {
		const inviteMember = vi.fn().mockResolvedValue({ error: null });
		const invalidateMembership = vi.fn().mockResolvedValue(undefined);

		const result = await submitInviteMember(
			{
				inviteMember,
				invalidateMembership,
			},
			{
				email: "captain@example.com",
				role: "agent",
				organizationId: "org_123",
			}
		);

		expect(result).toEqual({
			ok: true,
			data: {
				message: "Invitation sent to captain@example.com as agent.",
			},
		});
		expect(inviteMember).toHaveBeenCalledWith({
			email: "captain@example.com",
			role: "agent",
			organizationId: "org_123",
		});
		expect(invalidateMembership).toHaveBeenCalledTimes(1);
	});
});
