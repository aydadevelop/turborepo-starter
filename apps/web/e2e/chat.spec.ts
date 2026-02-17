import { expect, test } from "@playwright/test";
import { url } from "./helpers";

test.describe("Chat Page", () => {
	test("loads chat landing page", async ({ page }) => {
		await page.goto(url("/chat"));
		await expect(page).toHaveURL(url("/chat"));
	});

	test("displays sidebar with chats heading", async ({ page }) => {
		await page.goto(url("/chat"));
		await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
	});

	test("shows empty state when no chats exist", async ({ page }) => {
		await page.goto(url("/chat"));
		await expect(page.getByText("No chats yet")).toBeVisible();
	});

	test("shows new chat button in sidebar", async ({ page }) => {
		await page.goto(url("/chat"));
		await expect(
			page.locator("aside").getByRole("button")
		).toBeVisible();
	});

	test("creates a new chat from landing page", async ({ page }) => {
		await page.goto(url("/chat"));

		// Click "Start a new conversation" button on landing
		await page.getByRole("button", { name: /new chat/i }).click();

		// Should navigate to a chat page with a UUID
		await expect(page).toHaveURL(/\/chat\/[\w-]+/);
	});

	test("creates a new chat from sidebar", async ({ page }) => {
		await page.goto(url("/chat"));

		// Click the + button in sidebar header
		await page.locator("aside").getByRole("button").first().click();

		// Should navigate to a chat page
		await expect(page).toHaveURL(/\/chat\/[\w-]+/);
	});
});

test.describe("Chat Conversation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(url("/chat"));
		// Create a new chat
		await page.getByRole("button", { name: /new chat/i }).click();
		await expect(page).toHaveURL(/\/chat\/[\w-]+/);
	});

	test("displays prompt input area", async ({ page }) => {
		await expect(
			page.getByPlaceholder(/ask about boats/i)
		).toBeVisible();
	});

	test("has a send button that is disabled when input is empty", async ({ page }) => {
		const sendButton = page.getByRole("button").filter({ has: page.locator("svg") }).last();
		await expect(sendButton).toBeDisabled();
	});

	test("enables send button when text is entered", async ({ page }) => {
		const textarea = page.getByPlaceholder(/ask about boats/i);
		await textarea.fill("Hello");

		// The send button should now be enabled
		const sendButton = page.getByRole("button").filter({ has: page.locator("svg") }).last();
		await expect(sendButton).toBeEnabled();
	});

	test("sends a message and shows it in the chat", async ({ page }) => {
		const textarea = page.getByPlaceholder(/ask about boats/i);
		await textarea.fill("Hello, what boats do you have?");
		await textarea.press("Enter");

		// User message should appear
		await expect(page.getByText("Hello, what boats do you have?")).toBeVisible();

		// Should show a loading indicator while streaming
		await expect(page.locator("[role='log']")).toBeVisible();
	});

	test("chat appears in sidebar after creation", async ({ page }) => {
		// The sidebar should show the new chat
		const sidebar = page.locator("aside");
		await expect(sidebar.locator("a").first()).toBeVisible();
	});

	test("can delete a chat from sidebar", async ({ page }) => {
		const sidebar = page.locator("aside");
		const chatLink = sidebar.locator("a").first();
		await expect(chatLink).toBeVisible();

		// Hover to reveal delete button
		await chatLink.hover();
		const deleteButton = chatLink.getByRole("button");
		await deleteButton.click();

		// Should navigate back to /chat
		await expect(page).toHaveURL(url("/chat"));
	});

	test("takes screenshot of chat interface", async ({ page }) => {
		await page.screenshot({
			path: "test-results/chat-interface.png",
			fullPage: true,
		});
	});
});
