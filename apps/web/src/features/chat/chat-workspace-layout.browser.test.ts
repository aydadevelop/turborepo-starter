import { createRawSnippet } from "svelte";
import { writable } from "svelte/store";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	goto: vi.fn(() => Promise.resolve()),
	signInAnonymous: vi.fn(() => Promise.resolve()),
	listChats: vi.fn(async () => [
		{ id: "chat-1", title: "Boat leads" },
		{ id: "chat-2", title: "Operator tasks" },
	]),
	createChat: vi.fn(async () => ({ id: "chat-3", title: "New Chat" })),
	deleteChat: vi.fn(async () => undefined),
	session: {
		data: {
			session: { id: "session-1" },
			user: { id: "user-1", email: "anon@example.com", isAnonymous: true },
		},
		error: null,
		isPending: false,
	},
}));

vi.mock("$app/navigation", () => ({
	goto: mockState.goto,
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
	page: {
		params: {
			id: "chat-1",
		},
		url: new URL("http://localhost/chat/chat-1"),
		pathname: "/chat/chat-1",
		search: "",
	},
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		useSession: () => writable(mockState.session),
		signIn: {
			anonymous: mockState.signInAnonymous,
		},
	},
}));

vi.mock("$lib/assistant", () => ({
	assistantClient: {
		listChats: mockState.listChats,
		createChat: mockState.createChat,
		deleteChat: mockState.deleteChat,
	},
}));

import ChatWorkspaceLayout from "./ChatWorkspaceLayout.svelte";

test("renders the chat workspace layout with a loaded-state screenshot", async () => {
	const children = createRawSnippet(() => ({
		render: () => '<div class="p-6" data-testid="chat-layout-child">Select a chat</div>',
	}));

	renderWithQueryClient(ChatWorkspaceLayout, { children });

	await expect.element(page.getByText("Boat leads")).toBeVisible();
	await expect.element(page.getByText("Operator tasks")).toBeVisible();
	await expect.element(page.getByTestId("chat-layout-child")).toBeVisible();
	await expect(document.body).toMatchScreenshot("chat-workspace-layout");

	await userEvent.click(page.getByTestId("new-chat-button-sidebar"));
	expect(mockState.createChat).toHaveBeenCalledWith({ title: "New Chat" });
});
