import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../../../test/browser/render";

const MANAGER_BUTTON = /Manager/;

const mockState = vi.hoisted(() => ({
	canManage: {
		canManageOrganization: true,
		organizationId: "org_test",
	},
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
	mockState.inviteMember.mockClear();
	mockState.invalidateQueries.mockClear();
});

test("submits an invite through the feature screen contract", async () => {
	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"captain@example.com",
	);
	await expect(document.body).toMatchScreenshot("invite-member-screen");
	await userEvent.click(page.getByRole("button", { name: MANAGER_BUTTON }));
	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	expect(mockState.inviteMember).toHaveBeenCalledWith({
		email: "captain@example.com",
		role: "manager",
		organizationId: "org_test",
	});
	await expect
		.element(
			page.getByText("Invitation sent to captain@example.com as manager."),
		)
		.toBeInTheDocument();
});

test("shows a friendly error when the organization context is unavailable", async () => {
	mockState.canManage = {
		canManageOrganization: true,
		organizationId: "",
	};

	renderWithQueryClient(InviteMemberScreen);

	await userEvent.fill(
		page.getByLabelText("Email address"),
		"crew@example.com",
	);
	await userEvent.click(page.getByRole("button", { name: "Send Invitation" }));

	await expect
		.element(page.getByText("Organization not found. Please try again."))
		.toBeInTheDocument();
	expect(mockState.inviteMember).not.toHaveBeenCalled();
});
