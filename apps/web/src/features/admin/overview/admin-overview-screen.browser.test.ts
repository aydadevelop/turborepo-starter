import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	orgs: {
		items: [],
		total: 12,
		page: { limit: 5, offset: 0, total: 12, hasMore: true },
	},
	users: {
		items: [],
		total: 47,
		page: { limit: 5, offset: 0, total: 47, hasMore: true },
	},
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		admin: {
			organizations: {
				listOrgs: {
					queryOptions: () => ({
						queryKey: ["admin", "organizations", "list"],
						queryFn: async () => mockState.orgs,
					}),
				},
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

import AdminOverviewScreen from "./AdminOverviewScreen.svelte";

test("renders overview metrics through the shared overview screen", async () => {
	renderWithQueryClient(AdminOverviewScreen);

	await expect.element(page.getByText("Organizations")).toBeVisible();
	await expect.element(page.getByText("12")).toBeVisible();
	await expect.element(page.getByText("Users")).toBeVisible();
	await expect.element(page.getByText("47")).toBeVisible();
	await expect(document.body).toMatchScreenshot("admin-overview-screen");
});
