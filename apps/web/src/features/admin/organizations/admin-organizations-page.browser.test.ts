import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	orgs: {
		items: [
			{
				id: "org_1",
				name: "Alpha Marine",
				slug: "alpha-marine",
				logo: null,
				metadata: null,
				createdAt: new Date("2026-03-12T00:00:00.000Z"),
			},
			{
				id: "org_2",
				name: "North Star",
				slug: "north-star",
				logo: null,
				metadata: null,
				createdAt: new Date("2026-03-11T00:00:00.000Z"),
			},
		],
		total: 2,
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
			},
		},
	},
}));

import AdminOrganizationsPage from "../../../routes/(app)/admin/organizations/+page.svelte";

test("renders the admin organizations page with a loaded-state screenshot", async () => {
	renderWithQueryClient(AdminOrganizationsPage);

	await expect.element(page.getByText("Organizations")).toBeVisible();
	await expect.element(page.getByRole("cell", { name: "Alpha Marine" })).toBeVisible();
	await expect.element(page.getByRole("cell", { name: "North Star" })).toBeVisible();
	await expect(document.body).toMatchScreenshot("admin-organizations-page");
});
