import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../../../test/browser/render";
import type { PricingWorkspaceState } from "$lib/orpc-types";
import CreatePricingRuleForm from "./CreatePricingRuleForm.svelte";

const pricing: PricingWorkspaceState = {
	currencies: ["RUB"],
	defaultProfileId: "profile-1",
	hasPricing: true,
	profileRuleSummaries: [{ profileId: "profile-1", totalRuleCount: 0, activeRuleCount: 0 }],
	profiles: [
		{
			id: "profile-1",
			listingId: "listing-1",
			name: "Base",
			currency: "RUB",
			baseHourlyPriceCents: 120000,
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

test("submits pricing rule values through the section form contract", async () => {
	const onSubmit = vi.fn();

	renderComponent(CreatePricingRuleForm, {
		listingId: "listing-1",
		pricing,
		onSubmit,
	});
	await expect(document.body).toMatchScreenshot(
		"create-pricing-rule-form"
	);

	await userEvent.fill(page.getByLabelText("Rule name"), "Weekend uplift");
	await userEvent.selectOptions(page.getByLabelText("Rule type"), "dayOfWeek");
	await userEvent.fill(page.getByLabelText("Condition JSON"), '{"alwaysApply":true}');
	await userEvent.selectOptions(page.getByLabelText("Adjustment type"), "percent");
	await userEvent.fill(page.getByLabelText("Adjustment value"), "20");
	await userEvent.fill(page.getByLabelText("Priority"), "10");
	await userEvent.click(page.getByRole("button", { name: "Add pricing rule" }));

	await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
	expect(onSubmit).toHaveBeenCalledWith({
		listingId: "listing-1",
		pricingProfileId: "profile-1",
		name: "Weekend uplift",
		ruleType: "dayOfWeek",
		conditionJson: { alwaysApply: true },
		adjustmentType: "percent",
		adjustmentValue: 20,
		priority: 10,
	});
});
