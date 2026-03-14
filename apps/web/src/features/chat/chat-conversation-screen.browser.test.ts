import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	getChat: vi.fn(async () => ({
		id: "chat-1",
		title: "Boat leads",
		messages: [
			{
				id: "message-1",
				role: "assistant",
				parts: [
					{ type: "text", text: "Hello, how can I help with your fleet?" },
				],
			},
			{
				id: "message-2",
				role: "user",
				parts: [{ type: "text", text: "Show me pending bookings." }],
			},
		],
	})),
}));

vi.mock("$lib/assistant", () => ({
	assistantClient: {
		getChat: mockState.getChat,
	},
}));

vi.mock("@my-app/assistant/transport", () => ({
	createORPCChatTransport: () => ({}),
}));

import ChatConversationScreen from "./ChatConversationScreen.svelte";

test("renders a loaded chat conversation with a screenshot", async () => {
	renderWithQueryClient(ChatConversationScreen, {
		chatId: "chat-1",
	});

	await expect
		.element(page.getByText("Hello, how can I help with your fleet?"))
		.toBeVisible();
	await expect
		.element(page.getByText("Show me pending bookings."))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("chat-conversation-screen");

	await userEvent.fill(
		page.getByPlaceholder(
			"Ask about profile, todos, recurring reminders, or payments..."
		),
		"Create a new reminder"
	);
	await expect.element(page.getByTestId("send-message-button")).toBeEnabled();
});
