import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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
		await expect(page.locator("aside nav a")).toHaveCount(0);
	});

	test("shows new chat button in sidebar", async ({ page }) => {
		await page.goto(url("/chat"));
		await expect(page.locator("aside").getByRole("button")).toBeVisible();
	});

	test("creates a new chat", async ({ page }) => {
		await page.goto(url("/chat"));
		const signOutButton = page.getByTestId("sign-out-button");

		await page.getByRole("button", { name: /new chat/i }).click();
		await signOutButton
			.waitFor({ state: "visible", timeout: 5_000 })
			.catch(() => undefined);
		await page.getByRole("button", { name: /new chat/i }).click();

		// Should navigate to a chat page
		await expect(page).toHaveURL(/\/chat\/[\w-]+/);
	});

	test("creates a new chat from sidebar", async ({ page }) => {
		await page.goto(url("/chat"));
		const signOutButton = page.getByTestId("sign-out-button");

		await page.locator("aside").getByRole("button").first().click();
		await signOutButton
			.waitFor({ state: "visible", timeout: 5_000 })
			.catch(() => undefined);
		await page.locator("aside").getByRole("button").first().click();

		// Should navigate to a chat page
		await expect(page).toHaveURL(/\/chat\/[\w-]+/);
	});
});

test.describe("Chat Conversation", () => {
	test.describe.configure({ mode: "default" });

	let context: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		context = await browser.newContext();
		page = await context.newPage();

		await page.goto(url("/chat"));
		await page.getByRole("button", { name: /new chat/i }).click();

		await page.getByTestId("sign-out-button")
			.waitFor({ state: "visible", timeout: 10_000 })
			.catch(() => undefined);
		await page.getByRole("button", { name: /new chat/i }).click();
		await expect(page).toHaveURL(/\/chat\/[\w-]+/, { timeout: 10_000 });
	});

	test.afterAll(async () => {
		await page.screenshot({
			path: "test-results/chat-interface.png",
			fullPage: true,
		});
		await context.close();
	});

	test("displays prompt input area", async () => {
		const textarea = page.getByPlaceholder(/ask about boats/i);
		await expect(textarea).toBeVisible();
	});

	test("send button is disabled when input is empty", async () => {
		const sendButton = page.getByTestId("send-message-button");
		await expect(sendButton).toBeDisabled();
	});

	test("enables send button when text is entered", async () => {
		const textarea = page.getByPlaceholder(/ask about boats/i);
		await textarea.fill("Hello");

		const sendButton = page.getByTestId("send-message-button");
		await expect(sendButton).toBeEnabled();
	});

	test("sends a message and shows it in the chat", async () => {
		const textarea = page.getByPlaceholder(/ask about boats/i);
		await textarea.fill("Hello, what boats do you have?");
		await textarea.press("Enter");

		await expect(page.getByText("Hello, what boats do you have?")).toBeVisible();
		await expect(page.locator("[role='log']")).toBeVisible();
	});

	test("chat appears in sidebar after creation", async () => {
		const sidebar = page.locator("aside");
		await expect(sidebar.locator("a").first()).toBeVisible();
	});

	test("can delete a chat from sidebar", async () => {
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

});

test.describe("Chat Conversation With Tool", () => {
	test.describe.configure({ mode: "serial" });

	let context: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		context = await browser.newContext();
		page = await context.newPage();

		await page.goto(url("/chat"));
		await page.getByRole("button", { name: /new chat/i }).click();

		await page.getByTestId("sign-out-button")
			.waitFor({ state: "visible", timeout: 10_000 })
			.catch(() => undefined);
		await page.getByRole("button", { name: /new chat/i }).click();
		await expect(page).toHaveURL(/\/chat\/[\w-]+/, { timeout: 10_000 });
	});

	test.afterAll(async () => {
		await page.screenshot({
			path: "test-results/chat-interface-with-tool.png",
			fullPage: true,
		});
		await context.close();
	});

	test("shows tool output in chat", async () => {
		const textarea = page.getByPlaceholder(/ask about boats/i);
		await textarea.fill("Use the whoami tool and tell me my name and role.");
		await textarea.press("Enter");

		const toolTrigger = page.getByRole("button", { name: /tool-whoami/i });
		await expect(toolTrigger).toBeVisible({ timeout: 10_000 });

		if ((await toolTrigger.getAttribute("aria-expanded")) === "false") {
			await toolTrigger.click();
		}

		await expect(page.getByText(/Output/i)).toBeVisible({ timeout: 5_000 });
	});
});
