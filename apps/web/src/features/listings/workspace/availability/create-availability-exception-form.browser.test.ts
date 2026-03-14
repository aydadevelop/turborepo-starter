import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../../../test/browser/render";
import CreateAvailabilityExceptionForm from "./CreateAvailabilityExceptionForm.svelte";

const DATE_LABEL_RE = /^Date$/;

test("submits availability exception values through the section form contract", async () => {
	const onSubmit = vi.fn();

	renderComponent(CreateAvailabilityExceptionForm, {
		listingId: "listing-1",
		onSubmit,
	});
	await expect(document.body).toMatchScreenshot(
		"create-availability-exception-form"
	);

	await userEvent.fill(page.getByLabelText(DATE_LABEL_RE), "2026-06-03");
	await userEvent.click(
		page.getByLabelText(
			"This date has a partial available window instead of being fully blocked"
		)
	);
	await userEvent.fill(page.getByLabelText("Start time"), "12:00");
	await userEvent.fill(page.getByLabelText("End time"), "16:30");
	await userEvent.fill(page.getByLabelText("Reason"), "Late departure");
	await userEvent.click(
		page.getByRole("button", { name: "Add availability exception" })
	);

	await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
	expect(onSubmit).toHaveBeenCalledWith({
		listingId: "listing-1",
		date: "2026-06-03",
		isAvailable: true,
		startMinute: 720,
		endMinute: 990,
		reason: "Late departure",
	});
});
