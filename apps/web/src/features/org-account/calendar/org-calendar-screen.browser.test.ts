import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";

const mockState = vi.hoisted(() => ({
	addManualSource: vi.fn(async (input: { accountId: string; calendarId: string; name?: string }) => ({
		id: "source-manual",
		organizationId: "org-1",
		calendarAccountId: input.accountId,
		provider: "google",
		externalCalendarId: input.calendarId,
		name: input.name || input.calendarId,
		timezone: null,
		isPrimary: false,
		isHidden: false,
		isActive: true,
		lastDiscoveredAt: "2026-03-15T00:00:00.000Z",
		createdAt: "2026-03-15T00:00:00.000Z",
		updatedAt: "2026-03-15T00:00:00.000Z",
	})),
	attachSource: vi.fn(async () => ({})),
	disconnectAccount: vi.fn(async () => ({ success: true })),
	disconnectConnection: vi.fn(async () => ({ success: true })),
	deleteSource: vi.fn(async (input: { sourceId: string }) => ({
		success: true,
		sourceId: input.sourceId,
		disabledConnectionIds: ["connection-1"],
	})),
	invalidateQueries: vi.fn(() => Promise.resolve()),
	refetchQueries: vi.fn(() => Promise.resolve()),
	setQueryData: vi.fn(),
	renameSource: vi.fn(async (input: { sourceId: string; name: string }) => ({
		id: input.sourceId,
		organizationId: "org-1",
		calendarAccountId: "account-1",
		provider: "google",
		externalCalendarId: "team@group.calendar.google.com",
		name: input.name,
		timezone: "UTC",
		isPrimary: true,
		isHidden: false,
		isActive: true,
		lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
		createdAt: "2026-03-12T00:00:00.000Z",
		updatedAt: "2026-03-15T00:00:00.000Z",
	})),
	listings: {
		items: [
			{ id: "listing-1", name: "Ocean Voyager" },
			{ id: "listing-2", name: "Sea Explorer" },
		],
	},
	orgWorkspace: {
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
			{
				id: "account-2",
				organizationId: "org-1",
				provider: "google",
				externalAccountId: "google-account-old",
				accountEmail: "old@example.com",
				displayName: "Old Calendar",
				status: "disconnected",
				lastSyncedAt: null,
				lastError: null,
				createdAt: "2026-03-12T00:00:00.000Z",
				updatedAt: "2026-03-12T00:00:00.000Z",
			},
		],
		sources: [
			{
				id: "source-1",
				organizationId: "org-1",
				calendarAccountId: "account-1",
				provider: "google",
				externalCalendarId: "team@group.calendar.google.com",
				name: "Team Calendar",
				timezone: "UTC",
				isPrimary: true,
				isHidden: false,
				isActive: true,
				lastDiscoveredAt: "2026-03-12T00:00:00.000Z",
				createdAt: "2026-03-12T00:00:00.000Z",
				updatedAt: "2026-03-12T00:00:00.000Z",
			},
		],
		connections: [
			{
				id: "connection-1",
				listingId: "listing-1",
				listingName: "Ocean Voyager",
				organizationId: "org-1",
				calendarAccountId: "account-1",
				calendarSourceId: "source-1",
				provider: "google",
				externalCalendarId: "team@group.calendar.google.com",
				syncStatus: "idle",
				syncRetryCount: 0,
				lastSyncedAt: null,
				lastError: null,
				watchExpiration: null,
				isActive: true,
				createdAt: "2026-03-12T00:00:00.000Z",
				updatedAt: "2026-03-12T00:00:00.000Z",
			},
		],
	},
	setSourceVisibility: vi.fn(async () => ({})),
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
	page: {
		url: new URL("https://example.com/org/calendar"),
	},
}));

vi.mock("$lib/server-url", () => ({
	resolveServerPath: (path: string) => `http://localhost:43100${path}`,
}));

vi.mock("$lib/orpc", () => {
	const buildMutationOptions = <TInput, TResult>(
		fn: (input: TInput) => Promise<TResult>,
	) =>
		(options: Record<string, unknown> = {}) => ({
			mutationFn: fn,
			...options,
		});

	return {
		orpc: {
			calendar: {
				key: () => ["calendar"],
				getOrgWorkspaceState: {
					queryKey: () => ["calendar", "org-workspace"],
					queryOptions: () => ({
						queryKey: ["calendar", "org-workspace"],
						queryFn: async () => mockState.orgWorkspace,
					}),
				},
				addManualSource: {
					mutationOptions: buildMutationOptions(mockState.addManualSource),
				},
				attachSource: {
					mutationOptions: buildMutationOptions(mockState.attachSource),
				},
				disconnect: {
					mutationOptions: buildMutationOptions(mockState.disconnectConnection),
				},
				disconnectAccount: {
					mutationOptions: buildMutationOptions(mockState.disconnectAccount),
				},
				deleteSource: {
					mutationOptions: buildMutationOptions(mockState.deleteSource),
				},
				renameSource: {
					mutationOptions: buildMutationOptions(mockState.renameSource),
				},
				setSourceVisibility: {
					mutationOptions: buildMutationOptions(mockState.setSourceVisibility),
				},
			},
			listing: {
				list: {
					queryOptions: () => ({
						queryKey: ["listing", "list"],
						queryFn: async () => mockState.listings,
					}),
				},
			},
		},
		queryClient: {
			invalidateQueries: mockState.invalidateQueries,
			refetchQueries: mockState.refetchQueries,
			setQueryData: mockState.setQueryData,
		},
	};
});

import OrgCalendarScreen from "./OrgCalendarScreen.svelte";

test.beforeEach(() => {
	mockState.addManualSource.mockClear();
	mockState.attachSource.mockClear();
	mockState.disconnectAccount.mockClear();
	mockState.disconnectConnection.mockClear();
	mockState.deleteSource.mockClear();
	mockState.invalidateQueries.mockClear();
	mockState.refetchQueries.mockClear();
	mockState.setQueryData.mockClear();
	mockState.renameSource.mockClear();
	mockState.setSourceVisibility.mockClear();
});

test("shows source account provenance and supports adding a manual google calendar id", async () => {
	renderWithQueryClient(OrgCalendarScreen);

	await expect
		.element(page.getByText("Discovered calendars", { exact: true }))
		.toBeVisible();
	await expect
		.element(page.getByText("via Fleet Calendar · google-account-1").first())
		.toBeVisible();
	await expect
		.element(page.getByLabelText("Google account"))
		.toHaveValue("");
	await userEvent.selectOptions(page.getByLabelText("Google account"), "account-1");
	await userEvent.fill(page.getByLabelText("Name (optional)"), "Owner Calendar");

	await userEvent.fill(
		page.getByLabelText("Google calendar ID"),
		"legacy-screen-calendar@group.calendar.google.com",
	);
	await userEvent.click(page.getByRole("button", { name: "Add calendar" }));

	expect(mockState.addManualSource).toHaveBeenCalledWith(
		{
			accountId: "account-1",
			calendarId: "legacy-screen-calendar@group.calendar.google.com",
			name: "Owner Calendar",
		},
		expect.anything(),
	);
	expect(mockState.setQueryData).toHaveBeenCalled();
	expect(mockState.refetchQueries).toHaveBeenCalledWith({
		queryKey: ["calendar", "org-workspace"],
		exact: true,
	});

	await userEvent.click(page.getByRole("button", { name: "Rename" }).first());
	await userEvent.clear(page.getByLabelText("Calendar name"));
	await userEvent.fill(page.getByLabelText("Calendar name"), "Charter Team");
	await userEvent.click(page.getByRole("button", { name: "Save" }));

	expect(mockState.renameSource).toHaveBeenCalledWith(
		{
			sourceId: "source-1",
			name: "Charter Team",
		},
		expect.anything(),
	);
	expect(mockState.setQueryData).toHaveBeenCalled();

	await userEvent.click(page.getByRole("button", { name: "Delete" }).first());
	await userEvent.click(page.getByRole("button", { name: "Delete" }).nth(1));

	expect(mockState.deleteSource).toHaveBeenCalledWith(
		{
			sourceId: "source-1",
		},
		expect.anything(),
	);
	expect(mockState.setQueryData).toHaveBeenCalled();
	expect(mockState.refetchQueries).toHaveBeenCalledWith({
		queryKey: ["calendar", "org-workspace"],
		exact: true,
	});
});
