import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CalendarWorkspaceState } from "$lib/orpc-types";
import { renderComponent } from "../../../../test/browser/render";
import ListingWorkspaceCalendarSection from "./ListingWorkspaceCalendarSection.svelte";

const calendar: CalendarWorkspaceState = {
	accountCount: 1,
	activeConnectionCount: 1,
	connectedAccountCount: 1,
	accounts: [
		{
			id: "account-1",
			organizationId: "org-1",
			provider: "google",
			externalAccountId: "google-account-1",
			accountEmail: "fleet@example.com",
			displayName: "Fleet Calendar",
			status: "connected",
			lastSyncedAt: null,
			lastError: null,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	sourceCount: 2,
	activeSourceCount: 2,
	sources: [
		{
			id: "source-1",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			provider: "google",
			externalCalendarId: "calendar-primary",
			name: "Fleet Primary",
			timezone: "Europe/Moscow",
			isPrimary: true,
			isHidden: false,
			isActive: true,
			lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
		{
			id: "source-2",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			provider: "google",
			externalCalendarId: "calendar-backup",
			name: "Fleet Backup",
			timezone: "Europe/Moscow",
			isPrimary: false,
			isHidden: false,
			isActive: true,
			lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
		{
			id: "source-3",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			provider: "google",
			externalCalendarId: "calendar-hidden",
			name: "Hidden Fleet Calendar",
			timezone: "Europe/Moscow",
			isPrimary: false,
			isHidden: true,
			isActive: true,
			lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
		{
			id: "source-4",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			provider: "google",
			externalCalendarId: "calendar-inactive",
			name: "Inactive Fleet Calendar",
			timezone: "Europe/Moscow",
			isPrimary: false,
			isHidden: false,
			isActive: false,
			lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	hasConnectedCalendar: true,
	providers: ["google", "manual"],
	connections: [
		{
			id: "connection-1",
			listingId: "listing-1",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			calendarSourceId: "source-1",
			provider: "google",
			externalCalendarId: "calendar-primary",
			syncStatus: "idle",
			syncRetryCount: 0,
			lastSyncedAt: null,
			lastError: null,
			watchExpiration: null,
			isActive: true,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
		{
			id: "connection-2",
			listingId: "listing-1",
			organizationId: "org-1",
			calendarAccountId: "account-1",
			calendarSourceId: "source-4",
			provider: "google",
			externalCalendarId: "calendar-inactive",
			syncStatus: "disabled",
			syncRetryCount: 0,
			lastSyncedAt: null,
			lastError: null,
			watchExpiration: null,
			isActive: false,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
};

test("opens calendar discovery actions in a manage dialog", async () => {
	const onRefreshCalendarAccountSources = vi.fn();
	const onAttachCalendarSource = vi.fn();

	renderComponent(ListingWorkspaceCalendarSection, {
		calendar,
		googleCalendarConnectUrl:
			"http://localhost:43100/api/calendar/oauth/google/start",
		onRefreshCalendarAccountSources,
		onAttachCalendarSource,
	});

	await expect
		.element(page.getByRole("link", { name: "Connect Google" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Manage calendars" }))
		.toBeVisible();
	await expect.element(page.getByText("Fleet Primary").first()).toBeVisible();
	await expect.element(page.getByText("Inactive Fleet Calendar")).not.toBeInTheDocument();
	await expect.element(page.getByText("No calendar connections yet.")).not.toBeInTheDocument();

	await userEvent.click(page.getByRole("button", { name: "Manage calendars" }));
	await expect
		.element(page.getByRole("heading", { name: "Manage discovered calendars" }))
		.toBeVisible();
	await expect.element(page.getByText("Fleet Primary").first()).toBeVisible();
	await expect.element(page.getByText("Fleet Backup").first()).toBeVisible();
	await expect.element(page.getByText("Hidden Fleet Calendar")).not.toBeInTheDocument();
	await expect.element(page.getByText("Inactive Fleet Calendar")).not.toBeInTheDocument();
	await expect.element(page.getByText("Inactive")).not.toBeInTheDocument();

	await userEvent.click(
		page.getByRole("button", { name: "Refresh calendars" }),
	);
	expect(onRefreshCalendarAccountSources).toHaveBeenCalledWith("account-1");

	await userEvent.click(page.getByRole("button", { name: "Attach" }));
	expect(onAttachCalendarSource).toHaveBeenCalledWith("source-2");
});
