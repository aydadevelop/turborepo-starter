import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../test/browser/render";
import ChatEmptyStateScreen from "./ChatEmptyStateScreen.svelte";

test("renders the chat empty state with a loaded-state screenshot", async () => {
	const onCreateChat = vi.fn();

	renderComponent(ChatEmptyStateScreen, {
		creating: false,
		onCreateChat,
	});

	await expect
		.element(page.getByRole("heading", { name: "Workspace Assistant" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "New Chat" }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("chat-empty-state-screen");

	await userEvent.click(page.getByRole("button", { name: "New Chat" }));
	expect(onCreateChat).toHaveBeenCalledOnce();
});
