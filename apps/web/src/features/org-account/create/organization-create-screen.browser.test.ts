import { readable } from "svelte/store";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	session: {
		data: {
			user: {
				id: "user_1",
				name: "Dmitry",
				email: "dmitry@example.com",
			},
		},
		isPending: false,
	},
	organizations: [],
	create: vi.fn(async () => ({ data: { id: "org_1" }, error: null })),
	setActive: vi.fn(async () => ({ error: null })),
	list: vi.fn(async () => ({ data: [] })),
	invalidateQueries: vi.fn(() => Promise.resolve()),
	goto: vi.fn(() => Promise.resolve()),
}));

vi.mock("$app/navigation", () => ({
	goto: mockState.goto,
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
	page: {
		url: new URL("http://localhost/org/create?reason=new"),
		pathname: "/org/create",
		search: "?reason=new",
	},
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		useSession: () => readable(mockState.session),
		organization: {
			create: mockState.create,
			setActive: mockState.setActive,
			list: mockState.list,
		},
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		canManageOrganization: {
			key: () => ["can-manage-organization"],
		},
	},
	queryClient: {
		invalidateQueries: mockState.invalidateQueries,
		setQueryData: vi.fn(),
	},
}));

vi.mock("$lib/query-options", () => ({
	userOrganizationsQueryOptions: () => ({
		queryKey: ["organizations", "all"],
		queryFn: async () => mockState.organizations,
	}),
}));

import OrganizationCreateScreen from "./OrganizationCreateScreen.svelte";

test("renders the organization create page with a loaded-state screenshot", async () => {
	renderWithQueryClient(OrganizationCreateScreen);

	await expect
		.element(page.getByRole("heading", { name: "Create Organization" }))
		.toBeVisible();
	await expect.element(page.getByLabelText("Organization name")).toHaveValue("Dmitry");
	await expect
		.element(page.getByTestId("org-create-terms-scroll"))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("organization-create-screen");
});
