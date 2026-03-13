import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	canManage: {
		canManageOrganization: true,
		organizationId: "org_test",
	},
	deleteOrganization: vi.fn(async () => ({ error: null })),
	goto: vi.fn(() => Promise.resolve()),
	invalidateQueries: vi.fn(() => Promise.resolve()),
	organization: {
		id: "org_test",
		name: "Alpha Marine",
		slug: "alpha-marine",
	},
	updateOrganization: vi.fn(async () => ({ error: null })),
}));

vi.mock("$app/navigation", () => ({
	goto: mockState.goto,
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		organization: {
			update: mockState.updateOrganization,
			delete: mockState.deleteOrganization,
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

vi.mock("$lib/query-options", () => ({
	fullOrganizationQueryOptions: () => ({
		queryKey: ["organization", "full"],
		queryFn: async () => mockState.organization,
	}),
}));

import OrganizationSettingsScreen from "./OrganizationSettingsScreen.svelte";

test.beforeEach(() => {
	mockState.canManage = {
		canManageOrganization: true,
		organizationId: "org_test",
	};
	mockState.organization = {
		id: "org_test",
		name: "Alpha Marine",
		slug: "alpha-marine",
	};
	mockState.updateOrganization.mockClear();
	mockState.deleteOrganization.mockClear();
	mockState.invalidateQueries.mockClear();
	mockState.goto.mockClear();
});

test("seeds organization values from queries and submits changes", async () => {
	renderWithQueryClient(OrganizationSettingsScreen);

	await expect.element(page.getByLabelText("Name")).toHaveValue("Alpha Marine");
	await expect.element(page.getByLabelText("Slug")).toHaveValue("alpha-marine");
	await expect(document.body).toMatchScreenshot("organization-settings-screen");

	await userEvent.fill(page.getByLabelText("Name"), "North Star Charters");
	await userEvent.fill(page.getByLabelText("Slug"), "north-star-charters");
	await userEvent.click(page.getByRole("button", { name: "Save changes" }));

	expect(mockState.updateOrganization).toHaveBeenCalledWith({
		data: {
			name: "North Star Charters",
			slug: "north-star-charters",
		},
	});
	await expect.element(page.getByText("Changes saved.")).toBeInTheDocument();
	expect(mockState.goto).not.toHaveBeenCalled();
});

test("redirects away when the user cannot manage the organization", async () => {
	mockState.canManage = {
		canManageOrganization: false,
		organizationId: "",
	};

	renderWithQueryClient(OrganizationSettingsScreen);

	await expect.element(page.getByText("Access denied")).toBeInTheDocument();
	expect(mockState.goto).toHaveBeenCalledWith("/dashboard/settings");
});
