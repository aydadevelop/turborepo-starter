import { assistantRouter } from "@my-app/assistant/router";
import { call, implement } from "@orpc/server";
import type { Page } from "@playwright/test";
import type { UIMessage } from "ai";

/**
 * Mocks the initial chat history load using oRPC's implement function
 */
export const mockChatHistory = async (
	page: Page,
	chatId: string,
	messages: UIMessage[]
) => {
	// Create a fake implementation of the getChat procedure
	const fakeGetChat = implement(assistantRouter.getChat).handler(() => ({
		id: chatId,
		title: "Mocked Chat",
		userId: "mock-user",
		createdAt: new Date(),
		updatedAt: new Date(),
		messages,
	}));

	await page.route("**/rpc/getChat", async (route) => {
		const request = route.request();
		if (request.method() === "POST") {
			try {
				// Execute the fake handler via oRPC's call utility (no context needed)
				const result = await call(fakeGetChat, { chatId });

				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						data: result,
					}),
				});
			} catch (error) {
				console.error("Mock getChat failed:", error);
				route.continue();
			}
		} else {
			route.continue();
		}
	});
};

/**
 * Mocks a streaming chat response, useful for simulating tool calls
 */
export const mockChatStream = async (page: Page, streamChunks: string[]) => {
	await page.route("**/rpc/chat", async (route) => {
		// oRPC streaming typically uses NDJSON or SSE.
		// You'll need to match the exact format your version of oRPC expects.
		const streamBody = streamChunks.join("\n");

		await route.fulfill({
			status: 200,
			contentType: "application/x-ndjson", // Adjust based on oRPC spec
			body: streamBody,
		});
	});
};
