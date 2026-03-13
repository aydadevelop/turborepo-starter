import { readable } from "svelte/store";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	goto: vi.fn(() => Promise.resolve()),
	page: {
		url: new URL("http://localhost/todos"),
		pathname: "/todos",
		search: "",
	},
	session: {
		data: {
			session: { id: "session_1" },
			user: {
				id: "user_1",
				email: "operator@example.com",
				name: "Operator",
			},
		},
		error: null,
		isPending: false,
	},
	todos: [
		{ id: 1, text: "Prepare marina offers", completed: false },
		{ id: 2, text: "Confirm weekend charter slots", completed: true },
	],
}));

vi.mock("$app/navigation", () => ({
	goto: mockState.goto,
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
	page: mockState.page,
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		useSession: () => readable(mockState.session),
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		todo: {
			key: () => ["todo"],
			getAll: {
				queryKey: () => ["todo", "getAll"],
				queryOptions: () => ({
					queryKey: ["todo", "getAll"],
					queryFn: async () => mockState.todos,
				}),
			},
			create: {
				mutationOptions: (opts?: Record<string, unknown>) => ({
					mutationFn: async () => undefined,
					...opts,
				}),
			},
			toggle: {
				mutationOptions: (opts?: Record<string, unknown>) => ({
					mutationFn: async () => undefined,
					...opts,
				}),
			},
			delete: {
				mutationOptions: (opts?: Record<string, unknown>) => ({
					mutationFn: async () => undefined,
					...opts,
				}),
			},
		},
	},
}));

import TodosScreen from "./TodosScreen.svelte";

test("renders the todos page with a loaded-state screenshot", async () => {
	renderWithQueryClient(TodosScreen);

	await expect
		.element(page.getByRole("heading", { name: "Todos" }))
		.toBeVisible();
	await expect.element(page.getByText("Prepare marina offers")).toBeVisible();
	await expect
		.element(page.getByText("Confirm weekend charter slots"))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("todos-screen");
});
