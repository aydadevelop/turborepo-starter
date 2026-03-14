import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	params: { id: "org_1" },
	org: {
		id: "org_1",
		name: "Alpha Marine",
		slug: "alpha-marine",
		createdAt: "2026-03-12T00:00:00.000Z",
	},
	members: {
		items: [
			{
				id: "member_1",
				userName: "Dmitry",
				userEmail: "dmitry@example.com",
				role: "manager",
				createdAt: "2026-03-12T00:00:00.000Z",
			},
		],
		total: 1,
	},
	invitations: {
		items: [
			{
				id: "invite_1",
				email: "captain@example.com",
				role: "agent",
				status: "pending",
				expiresAt: "2026-03-30T00:00:00.000Z",
			},
		],
		total: 1,
	},
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
	page: {
		params: mockState.params,
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		admin: {
			organizations: {
				getOrg: {
					queryOptions: () => ({
						queryKey: ["admin", "organizations", "get", mockState.params.id],
						queryFn: async () => mockState.org,
					}),
				},
				listMembers: {
					queryOptions: () => ({
						queryKey: [
							"admin",
							"organizations",
							"members",
							mockState.params.id,
						],
						queryFn: async () => mockState.members,
					}),
				},
				listInvitations: {
					queryOptions: () => ({
						queryKey: [
							"admin",
							"organizations",
							"invitations",
							mockState.params.id,
						],
						queryFn: async () => mockState.invitations,
					}),
				},
			},
		},
	},
}));

import OrganizationDetailScreen from "./OrganizationDetailScreen.svelte";

test("renders organization members and invitations through the shared admin surfaces", async () => {
	renderWithQueryClient(OrganizationDetailScreen);

	await expect.element(page.getByText("Alpha Marine")).toBeVisible();
	await expect
		.element(page.getByRole("cell", { name: "Dmitry", exact: true }))
		.toBeVisible();
	await page.getByRole("tab", { name: "Invitations (1)" }).click();
	await expect
		.element(
			page.getByRole("cell", { name: "captain@example.com", exact: true })
		)
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("organization-detail-screen");
});
