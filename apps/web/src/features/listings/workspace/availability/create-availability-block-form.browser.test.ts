import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../../../test/browser/render";
import CreateAvailabilityBlockForm from "./CreateAvailabilityBlockForm.svelte";

test("submits availability block values through the section form contract", async () => {
	const onSubmit = vi.fn();

	renderComponent(CreateAvailabilityBlockForm, {
		listingId: "listing-1",
		onSubmit,
	});
	await expect(document.body).toMatchScreenshot(
		"create-availability-block-form"
	);

	await userEvent.fill(page.getByLabelText("Starts at"), "2026-06-01T10:00");
	await userEvent.fill(page.getByLabelText("Ends at"), "2026-06-01T18:00");
	await userEvent.fill(page.getByLabelText("Reason"), "Private charter");
	await userEvent.click(
		page.getByRole("button", { name: "Add availability block" })
	);

	await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
	expect(onSubmit).toHaveBeenCalledWith({
		listingId: "listing-1",
		startsAt: new Date("2026-06-01T10:00").toISOString(),
		endsAt: new Date("2026-06-01T18:00").toISOString(),
		reason: "Private charter",
	});
});
