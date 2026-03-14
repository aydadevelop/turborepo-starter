import { expect, test, vi } from "vitest";
import { page as browserPage, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	params: { ticketId: "ticket_1" },
	ticket: {
		ticket: {
			id: "ticket_1",
			subject: "Pickup details",
			description: "Need clarification on departure point.",
			status: "pending_operator",
		},
		messages: [
			{
				id: "message_1",
				body: "Please confirm the marina gate.",
				createdAt: "2026-06-01T10:00:00.000Z",
			},
		],
	},
	mutate: vi.fn(),
	invalidateQueries: vi.fn(),
}));

vi.mock("$app/state", () => ({
	page: {
		params: mockState.params,
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		support: {
			getMyTicket: {
				key: () => ["support", "getMyTicket"],
				queryOptions: () => ({
					queryKey: ["support", "getMyTicket", mockState.params.ticketId],
					queryFn: async () => mockState.ticket,
				}),
			},
			addMyMessage: {
				mutationOptions: ({ onSuccess }: { onSuccess?: () => void }) => ({
					mutationFn: (input: unknown) => {
						mockState.mutate(input);
						onSuccess?.();
						return { id: "message_2" };
					},
				}),
			},
		},
	},
	queryClient: {
		invalidateQueries: mockState.invalidateQueries,
	},
}));

import CustomerSupportTicketScreen from "./CustomerSupportTicketScreen.svelte";

test("renders support ticket detail through the shared screen pattern", async () => {
	renderWithQueryClient(CustomerSupportTicketScreen);

	await expect.element(browserPage.getByText("Pickup details")).toBeVisible();
	await expect
		.element(browserPage.getByText("Please confirm the marina gate."))
		.toBeVisible();
	await expect
		.element(browserPage.getByRole("button", { name: "Send reply" }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"customer-support-ticket-screen",
	);
});

test("submits a reply through the screen mutation", async () => {
	mockState.mutate.mockClear();
	mockState.invalidateQueries.mockClear();

	renderWithQueryClient(CustomerSupportTicketScreen);

	await userEvent.fill(
		browserPage.getByPlaceholder("Write a reply…"),
		"Gate 2?",
	);
	await userEvent.click(
		browserPage.getByRole("button", { name: "Send reply" }),
	);

	expect(mockState.mutate).toHaveBeenCalledWith({
		ticketId: "ticket_1",
		body: "Gate 2?",
	});
	expect(mockState.invalidateQueries).toHaveBeenCalled();
});
