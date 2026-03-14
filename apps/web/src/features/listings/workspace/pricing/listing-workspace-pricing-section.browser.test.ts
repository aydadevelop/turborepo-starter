import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { PricingWorkspaceState } from "$lib/orpc-types";
import { renderComponent } from "../../../../test/browser/render";
import ListingWorkspacePricingSection from "./ListingWorkspacePricingSection.svelte";

const pricing: PricingWorkspaceState = {
	currencies: ["RUB"],
	defaultProfileId: "profile-1",
	hasPricing: true,
	profileRuleSummaries: [
		{ profileId: "profile-1", totalRuleCount: 0, activeRuleCount: 0 },
	],
	profiles: [
		{
			id: "profile-1",
			listingId: "listing-1",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 120_000,
			minimumHours: 2,
			serviceFeeBps: 0,
			taxBps: 0,
			isDefault: true,
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
	],
	totalActiveRuleCount: 0,
	totalRuleCount: 0,
};

test("opens pricing actions in dialogs instead of stacking inline forms", async () => {
	const onCreatePricingProfile = vi.fn();
	const onCreatePricingRule = vi.fn();

	renderComponent(ListingWorkspacePricingSection, {
		listingId: "listing-1",
		pricing,
		onCreatePricingProfile,
		onCreatePricingRule,
	});

	await expect
		.element(page.getByRole("button", { name: "Add profile" }))
		.toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Add rule" }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"listing-workspace-pricing-section",
	);

	await userEvent.click(page.getByRole("button", { name: "Add profile" }));
	await expect
		.element(page.getByRole("heading", { name: "Create pricing profile" }))
		.toBeVisible();
	await expect.element(page.getByLabelText("Profile name")).toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Close" }));
	await userEvent.click(page.getByRole("button", { name: "Add rule" }));
	await expect
		.element(page.getByRole("heading", { name: "Add pricing rule" }))
		.toBeVisible();
	await expect.element(page.getByLabelText("Rule name")).toBeVisible();
});
