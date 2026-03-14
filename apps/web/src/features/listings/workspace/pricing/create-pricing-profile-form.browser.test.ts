import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { PricingWorkspaceState } from "$lib/orpc-types";
import { renderComponent } from "../../../../test/browser/render";
import CreatePricingProfileForm from "./CreatePricingProfileForm.svelte";

const pricing: PricingWorkspaceState = {
	currencies: ["RUB", "USD"],
	defaultProfileId: "profile-1",
	hasPricing: true,
	profileRuleSummaries: [],
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

test("submits pricing profile values through the section form contract", async () => {
	const onSubmit = vi.fn();

	renderComponent(CreatePricingProfileForm, {
		listingId: "listing-1",
		pricing,
		onSubmit,
	});
	await expect(document.body).toMatchScreenshot("create-pricing-profile-form");

	await userEvent.fill(page.getByLabelText("Profile name"), "Weekend");
	await userEvent.selectOptions(page.getByLabelText("Currency"), "USD");
	await userEvent.fill(
		page.getByLabelText("Base hourly price (cents)"),
		"250000"
	);
	await userEvent.fill(page.getByLabelText("Minimum hours"), "3");
	await userEvent.fill(page.getByLabelText("Service fee (bps)"), "500");
	await userEvent.fill(page.getByLabelText("Tax (bps)"), "2000");
	await userEvent.click(
		page.getByRole("button", { name: "Create pricing profile" })
	);

	expect(onSubmit).toHaveBeenCalledWith({
		listingId: "listing-1",
		name: "Weekend",
		currency: "USD",
		baseHourlyPriceCents: 250_000,
		minimumHours: 3,
		serviceFeeBps: 500,
		taxBps: 2000,
		isDefault: false,
	});
});
