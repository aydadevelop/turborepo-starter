import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	users: {
		items: [
			{
				id: "user_1",
				name: "Dmitry",
				email: "dmitry@example.com",
				role: "admin",
				banned: false,
				organizationCount: 3,
			},
			{
				id: "user_2",
				name: "Anna",
				email: "anna@example.com",
				role: "manager",
				banned: false,
				organizationCount: 1,
			},
		],
		total: 2,
	},
	impersonateUser: vi.fn(async () => ({ error: null })),
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		admin: {
			impersonateUser: mockState.impersonateUser,
		},
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		admin: {
			organizations: {
				listUsers: {
					queryOptions: () => ({
						queryKey: ["admin", "users", "list"],
						queryFn: async () => mockState.users,
					}),
				},
			},
		},
	},
}));

import AdminUsersPage from "../../../routes/(app)/admin/users/+page.svelte";

test("renders the admin users page with a loaded-state screenshot", async () => {
	renderWithQueryClient(AdminUsersPage);

	await expect.element(page.getByText("Users")).toBeVisible();
	await expect
		.element(page.getByRole("cell", { name: "Dmitry", exact: true }))
		.toBeVisible();
	await expect
		.element(page.getByRole("cell", { name: "Anna", exact: true }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("admin-users-page");
});
