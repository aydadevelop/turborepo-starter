import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	invalidateQueries: vi.fn(() => Promise.resolve()),
	organization: {
		id: "org_test",
		name: "Alpha Marine",
		slug: "alpha-marine",
		members: [
			{
				id: "member_1",
				userId: "user_1",
				role: "manager",
				user: {
					name: "Dmitry",
					email: "dmitry@example.com",
				},
			},
		],
		invitations: [
			{
				id: "invite_1",
				email: "captain@example.com",
				role: "agent",
				status: "pending",
			},
		],
	},
	cancelInvitation: vi.fn(async () => ({ error: null })),
	removeMember: vi.fn(async () => ({ error: null })),
	updateMemberRole: vi.fn(async () => ({ error: null })),
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		organization: {
			cancelInvitation: mockState.cancelInvitation,
			removeMember: mockState.removeMember,
			updateMemberRole: mockState.updateMemberRole,
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
	fullOrganizationQueryOptions: () => ({
		queryKey: ["organization", "full"],
		queryFn: async () => mockState.organization,
	}),
}));

import OrganizationTeamScreen from "./OrganizationTeamScreen.svelte";

test.beforeEach(() => {
	mockState.invalidateQueries.mockClear();
	mockState.cancelInvitation.mockClear();
	mockState.removeMember.mockClear();
	mockState.updateMemberRole.mockClear();
});

test("renders members and pending invitations through the shared table surface", async () => {
	renderWithQueryClient(OrganizationTeamScreen);

	await expect
		.element(page.getByRole("cell", { name: "Dmitry", exact: true }))
		.toBeInTheDocument();
	await expect
		.element(
			page.getByRole("cell", { name: "captain@example.com", exact: true })
		)
		.toBeInTheDocument();
	await expect
		.element(page.getByRole("button", { name: "Role" }))
		.toBeInTheDocument();
	await expect
		.element(page.getByRole("button", { name: "Cancel" }))
		.toBeInTheDocument();
	await expect(document.body).toMatchScreenshot("organization-team-screen");
});
