import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../../../test/browser/render";
import CreateAvailabilityRuleForm from "./CreateAvailabilityRuleForm.svelte";

test("submits recurring availability values through the section form contract", async () => {
	const onSubmit = vi.fn();

	renderComponent(CreateAvailabilityRuleForm, {
		listingId: "listing-1",
		onSubmit,
	});
	await expect(document.body).toMatchScreenshot(
		"create-availability-rule-form"
	);

	await userEvent.selectOptions(page.getByLabelText("Day"), "5");
	await userEvent.fill(page.getByLabelText("Start time"), "10:30");
	await userEvent.fill(page.getByLabelText("End time"), "18:00");
	await userEvent.click(
		page.getByRole("button", { name: "Add recurring rule" })
	);

	expect(onSubmit).toHaveBeenCalledWith({
		listingId: "listing-1",
		dayOfWeek: 5,
		startMinute: 630,
		endMinute: 1080,
	});
});
