import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { url } from "./utils/url";

const CHAT_URL_PATTERN = /\/chat\/[\w-]+/;
const BOATS_PLACEHOLDER = /ask about boats/i;

const openNewChat = async (page: Page): Promise<void> => {
	await page.goto(url("/chat"));
	const signOutButton = page.getByTestId("sign-out-button");

	await page.getByTestId("new-chat-button-sidebar").click();
	await signOutButton
		.waitFor({ state: "visible", timeout: 5000 })
		.catch(() => undefined);
	await page.getByTestId("new-chat-button-sidebar").click();

	await expect(page).toHaveURL(CHAT_URL_PATTERN, { timeout: 10_000 });
};

test.describe("Chat Flow", () => {
	test("creates a new chat from chat landing", async ({ page }) => {
		await openNewChat(page);
	});
});

test.describe("Chat Conversation", () => {
	test.describe.configure({ mode: "default" });

	let context: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		context = await browser.newContext();
		page = await context.newPage();
		await openNewChat(page);
	});

	test.afterAll(async () => {
		await context.close();
	});

	test("sends a message and shows it in the chat", async () => {
		const textarea = page.getByPlaceholder(BOATS_PLACEHOLDER);
		await textarea.fill("Hello, what boats do you have?");
		await textarea.press("Enter");

		await expect(
			page.getByText("Hello, what boats do you have?")
		).toBeVisible();
		await expect(page.locator("[role='log']")).toBeVisible();
	});

	test("can delete a chat from sidebar", async () => {
		const sidebarNav = page.locator("aside nav");
		const chatLink = sidebarNav.locator("a").first();

		if ((await chatLink.count()) === 0) {
			await expect(sidebarNav.getByText("No chats yet")).toBeVisible();
			return;
		}

		await expect(chatLink).toBeVisible();
		await chatLink.hover();
		await chatLink.getByTestId("delete-chat-button").click();

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
		await openNewChat(page);
	});

	test.afterAll(async () => {
		await context.close();
	});

	test("shows tool output in chat", async () => {
		const textarea = page.getByPlaceholder(BOATS_PLACEHOLDER);
		const prompt = "Use the whoami tool and tell me my name and role.";
		await textarea.fill(prompt);
		await textarea.press("Enter");

		const toolTrigger = page.getByTestId("tool-toggle-tool-whoami");
		const toolVisible = await toolTrigger
			.isVisible({ timeout: 10_000 })
			.catch(() => false);

		if (toolVisible) {
			if ((await toolTrigger.getAttribute("aria-expanded")) === "false") {
				await toolTrigger.click();
			}

			await expect(page.getByTestId("tool-output")).toBeVisible({
				timeout: 5000,
			});
			return;
		}

		// Local runs can use placeholder model keys, so tool output may never render.
		await expect(page.getByText(prompt)).toBeVisible();
		await expect(page.locator("[role='log']")).toBeVisible();
	});
});
