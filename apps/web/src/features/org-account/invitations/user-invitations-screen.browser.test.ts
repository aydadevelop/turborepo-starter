import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	invalidateQueries: vi.fn(() => Promise.resolve()),
	acceptInvitation: vi.fn(async () => ({ error: null })),
	rejectInvitation: vi.fn(async () => ({ error: null })),
	invitations: [
		{
			id: "invite_1",
			organizationName: "Alpha Marine",
			role: "manager",
			status: "pending",
			expiresAt: "2026-03-20T12:00:00.000Z",
		},
		{
			id: "invite_2",
			organizationName: "North Star",
			role: "agent",
			status: "accepted",
			expiresAt: "2026-03-18T12:00:00.000Z",
		},
	],
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		organization: {
			acceptInvitation: mockState.acceptInvitation,
			rejectInvitation: mockState.rejectInvitation,
		},
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		canManageOrganization: {
			key: () => ["can-manage-organization"],
		},
		listing: {
			key: () => ["listing"],
		},
		notifications: {
			key: () => ["notifications"],
		},
		todo: {
			key: () => ["todo"],
		},
	},
	queryClient: {
		invalidateQueries: mockState.invalidateQueries,
	},
}));

vi.mock("$lib/query-options", () => ({
	userInvitationsQueryOptions: () => ({
		queryKey: ["invitations", "user"],
		queryFn: async () => mockState.invitations,
	}),
}));

import UserInvitationsScreen from "./UserInvitationsScreen.svelte";

test.beforeEach(() => {
	mockState.invalidateQueries.mockClear();
	mockState.acceptInvitation.mockClear();
	mockState.rejectInvitation.mockClear();
});

test("renders pending and past invitations through shared cards and handles acceptance", async () => {
	renderWithQueryClient(UserInvitationsScreen);

	await expect.element(page.getByText("Pending invitations")).toBeVisible();
	await expect.element(page.getByText("Past invitations")).toBeVisible();
	await expect.element(page.getByText("Alpha Marine")).toBeVisible();
	await expect.element(page.getByText("North Star")).toBeVisible();
	await expect(document.body).toMatchScreenshot("user-invitations-screen");

	await userEvent.click(page.getByRole("button", { name: "Accept" }));

	expect(mockState.acceptInvitation).toHaveBeenCalled();
});
