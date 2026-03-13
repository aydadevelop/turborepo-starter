import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../../../test/browser/render";
import { ORG_ROLE_OPTIONS } from "../../shared/roles";

const mockState = vi.hoisted(() => ({
	canManage: {
		canManageOrganization: true,
		organizationId: "org_test",
	},
	currentUserRole: "org_owner" as string,
	invalidateQueries: vi.fn(() => Promise.resolve()),
	inviteMember: vi.fn(async () => ({ error: null })),
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		organization: {
			inviteMember: mockState.inviteMember,
		},
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		canManageOrganization: {
			key: () => ["can-manage-organization"],
			queryOptions: () => ({
				queryKey: ["can-manage-organization"],
				queryFn: async () => mockState.canManage,
			}),
		},
	},
	queryClient: {
		invalidateQueries: mockState.invalidateQueries,
	},
}));

import InviteMemberScreen from "./InviteMemberScreen.svelte";

test.beforeEach(() => {
	mockState.canManage = {
		canManageOrganization: true,
		organizationId: "org_test",
	};
	mockState.currentUserRole = "org_owner";
	mockState.inviteMember.mockClear();
	mockState.invalidateQueries.mockClear();
});

// Test each role option is visible and selectable
for (const role of ORG_ROLE_OPTIONS.filter((r) => r.value !== "org_owner")) {
	test(`renders ${role.label} role option with correct description`, async () => {
		renderWithQueryClient(InviteMemberScreen);

		// Wait for component to render
		await new Promise((r) => setTimeout(r, 100));

		// Verify role button exists with label
		const roleButton = page.getByRole("button", { name: new RegExp(role.label) });
		await expect.element(roleButton).toBeInTheDocument();

		// Verify description is visible (use first() to avoid strict mode violation)
		const description = page.getByText(role.description).first();
		await expect.element(description).toBeInTheDocument();

		// Take screenshot of the role option
		await expect(page.getByRole("button", { name: new RegExp(role.label) })).toMatchScreenshot(
			`role-option-${role.value}`
		);
	});
}

test("selects manager role and submits invite", async () => {
	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"captain@example.com"
	);

	// Click manager role
	await userEvent.click(page.getByRole("button", { name: /Manager/ }));

	// Take screenshot showing manager selected
	await expect(page.getByRole("button", { name: /Manager/ })).toMatchScreenshot(
		"manager-role-selected"
	);

	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	expect(mockState.inviteMember).toHaveBeenCalledWith({
		email: "captain@example.com",
		role: "manager",
		organizationId: "org_test",
	});
});

test("selects agent role and submits invite", async () => {
	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"crew@example.com"
	);

	// Click agent role (recommended for captains)
	await userEvent.click(page.getByRole("button", { name: /Agent/ }));

	// Verify recommended label is shown (use first() to avoid strict mode)
	const recommendedLabel = page.getByText("Recommended for captains").first();
	await expect.element(recommendedLabel).toBeInTheDocument();

	// Take screenshot showing agent selected with recommended label
	await expect(page.getByRole("button", { name: /Agent/ })).toMatchScreenshot(
		"agent-role-selected-with-recommended"
	);

	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	expect(mockState.inviteMember).toHaveBeenCalledWith({
		email: "crew@example.com",
		role: "agent",
		organizationId: "org_test",
	});
});

test("selects admin role and submits invite", async () => {
	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"admin@example.com"
	);

	// Click admin role
	await userEvent.click(page.getByRole("button", { name: /Admin/ }));

	// Take screenshot showing admin selected
	await expect(page.getByRole("button", { name: /Admin/ })).toMatchScreenshot(
		"admin-role-selected"
	);

	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	expect(mockState.inviteMember).toHaveBeenCalledWith({
		email: "admin@example.com",
		role: "org_admin",
		organizationId: "org_test",
	});
});

test("selects member role and submits invite", async () => {
	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"member@example.com"
	);

	// Click member role
	await userEvent.click(page.getByRole("button", { name: /^Member/ }));

	// Take screenshot showing member selected
	await expect(page.getByRole("button", { name: /^Member/ })).toMatchScreenshot(
		"member-role-selected"
	);

	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	expect(mockState.inviteMember).toHaveBeenCalledWith({
		email: "member@example.com",
		role: "member",
		organizationId: "org_test",
	});
});

test("full invite form with all roles visible", async () => {
	renderWithQueryClient(InviteMemberScreen);

	// Wait for render
	await new Promise((r) => setTimeout(r, 100));

	// Take full screenshot of the invite form
	await expect(document.body).toMatchScreenshot("invite-form-all-roles");

	// Verify all non-owner roles are present
	for (const role of ORG_ROLE_OPTIONS.filter((r) => r.value !== "org_owner")) {
		const roleButton = page.getByRole("button", { name: new RegExp(role.label) });
		await expect.element(roleButton).toBeInTheDocument();
	}
});

test("shows error when organization context is unavailable", async () => {
	mockState.canManage = {
		canManageOrganization: true,
		organizationId: "",
	};

	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"test@example.com"
	);
	await userEvent.click(page.getByRole("button", { name: /Manager/ }));
	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	await expect
		.element(page.getByText("Organization not found. Please try again."))
		.toBeInTheDocument();

	// Take screenshot of error state
	await expect(document.body).toMatchScreenshot("invite-form-org-error");
});

test("validates email is required", async () => {
	renderWithQueryClient(InviteMemberScreen);

	// Try to submit without email
	await userEvent.click(page.getByRole("button", { name: /Manager/ }));
	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	// Should show validation error
	const errorText = page.getByText("Email is required.");
	await expect.element(errorText).toBeInTheDocument();

	// Take screenshot of validation error
	await expect(document.body).toMatchScreenshot("invite-form-validation-error");
});
