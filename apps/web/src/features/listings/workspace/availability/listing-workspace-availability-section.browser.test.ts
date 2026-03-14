import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { AvailabilityWorkspaceState } from "$lib/orpc-types";
import { renderComponent } from "../../../../test/browser/render";
import ListingWorkspaceAvailabilitySection from "./ListingWorkspaceAvailabilitySection.svelte";

const availability: AvailabilityWorkspaceState = {
	activeBlockCount: 1,
	activeRuleCount: 1,
	exceptionCount: 1,
	hasAvailability: true,
	rules: [
		{
			id: "rule-1",
			listingId: "listing-1",
			dayOfWeek: 5,
			startMinute: 600,
			endMinute: 1320,
			isActive: true,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	blocks: [],
	exceptions: [],
};

test("opens availability actions in dialogs instead of stacking inline forms", async () => {
	const onAddAvailabilityRule = vi.fn();
	const onAddAvailabilityBlock = vi.fn();
	const onAddAvailabilityException = vi.fn();

	renderComponent(ListingWorkspaceAvailabilitySection, {
		listingId: "listing-1",
		availability,
		onAddAvailabilityRule,
		onAddAvailabilityBlock,
		onAddAvailabilityException,
	});

	await expect
		.element(page.getByRole("button", { name: "Add recurring rule" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Add block" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Add exception" }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"listing-workspace-availability-section"
	);

	await userEvent.click(page.getByRole("button", { name: "Add block" }));
	await expect
		.element(page.getByRole("heading", { name: "Add availability block" }))
		.toBeVisible();
	await expect.element(page.getByLabelText("Starts at")).toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Close" }));
	await userEvent.click(page.getByRole("button", { name: "Add exception" }));
	await expect
		.element(page.getByRole("heading", { name: "Add availability exception" }))
		.toBeVisible();
	await expect
		.element(page.getByLabelText("Date", { exact: true }))
		.toBeVisible();
});
