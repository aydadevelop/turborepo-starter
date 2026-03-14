import { describe, expect, it, vi } from "vitest";
import { deleteOrganizationRecord, submitOrganizationSettings } from "./submit";

describe("submitOrganizationSettings", () => {
	it("rejects invalid input before calling auth", async () => {
		const updateOrganization = vi.fn();
		const invalidateOrganizationStructure = vi.fn();

		const result = await submitOrganizationSettings(
			{
				updateOrganization,
				invalidateOrganizationStructure,
			},
			{ name: "", slug: "valid-slug" },
		);

		expect(result).toEqual({
			ok: false,
			message: "Organization name is required.",
		});
		expect(updateOrganization).not.toHaveBeenCalled();
	});

	it("submits trimmed values and invalidates on success", async () => {
		const updateOrganization = vi.fn().mockResolvedValue({ error: null });
		const invalidateOrganizationStructure = vi
			.fn()
			.mockResolvedValue(undefined);

		const result = await submitOrganizationSettings(
			{
				updateOrganization,
				invalidateOrganizationStructure,
			},
			{ name: "  Charter Ops  ", slug: "  charter-ops  " },
		);

		expect(result.ok).toBe(true);
		expect(updateOrganization).toHaveBeenCalledWith({
			data: {
				name: "Charter Ops",
				slug: "charter-ops",
			},
		});
		expect(invalidateOrganizationStructure).toHaveBeenCalledTimes(1);
	});
});

describe("deleteOrganizationRecord", () => {
	it("requires an organization id", async () => {
		const deleteOrganization = vi.fn();
		const invalidateOrganizationStructure = vi.fn();

		const result = await deleteOrganizationRecord(
			{
				deleteOrganization,
				invalidateOrganizationStructure,
			},
			undefined,
		);

		expect(result).toEqual({
			ok: false,
			message: "Organization not found. Please try again.",
		});
		expect(deleteOrganization).not.toHaveBeenCalled();
	});
});
