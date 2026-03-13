import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	bookings: [
		{
			id: "booking_12345678",
			startsAt: "2026-06-01T09:00:00.000Z",
			endsAt: "2026-06-01T12:00:00.000Z",
			status: "confirmed",
		},
	],
	tickets: {
		items: [
			{
				id: "ticket_1",
				bookingId: "booking_12345678",
				subject: "Need to change pickup point",
				status: "pending_operator",
			},
		],
		page: { limit: 20, offset: 0, total: 1, hasMore: false },
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		booking: {
			listMyBookings: {
				queryOptions: () => ({
					queryKey: ["booking", "listMyBookings"],
					queryFn: async () => mockState.bookings,
				}),
			},
		},
		support: {
			listMyTickets: {
				queryOptions: () => ({
					queryKey: ["support", "listMyTickets"],
					queryFn: async () => mockState.tickets,
				}),
			},
		},
	},
}));

import DashboardBookingsScreen from "./DashboardBookingsScreen.svelte";

test("renders bookings through the shared screen pattern", async () => {
	renderWithQueryClient(DashboardBookingsScreen);

	await expect.element(page.getByText("My Bookings")).toBeVisible();
	await expect.element(page.getByText(/Booking history/)).toBeVisible();
	await expect.element(page.getByRole("table")).toBeVisible();
	await expect(document.body).toMatchScreenshot("dashboard-bookings-screen");
});
