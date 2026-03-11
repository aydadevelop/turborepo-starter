import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../test/browser/render";
import ListingEditorForm from "./ListingEditorForm.svelte";
import { listingTypeOptions } from "./listing-editor.test-data";

test("submits listing editor values through the live component contract", async () => {
	const onSubmit = vi.fn();

	renderComponent(ListingEditorForm, {
		mode: "create",
		submitLabel: "Create listing",
		onSubmit,
		listingTypeOptions,
	});

	await userEvent.fill(page.getByLabelText("Name"), "Evening Charter");
	await userEvent.fill(page.getByLabelText("Slug"), "evening-charter");
	await userEvent.selectOptions(
		page.getByLabelText("Timezone"),
		"Europe/Berlin"
	);
	await userEvent.click(page.getByRole("button", { name: "Edit JSON" }));
	await userEvent.fill(
		page.getByLabelText("Metadata JSON"),
		JSON.stringify({ captainIncluded: true }, null, 2)
	);
	await userEvent.click(page.getByRole("button", { name: "Create listing" }));

	expect(onSubmit).toHaveBeenCalledWith({
		listingTypeSlug: "vessel",
		name: "Evening Charter",
		slug: "evening-charter",
		timezone: "Europe/Berlin",
		description: undefined,
		metadata: {
			captainIncluded: true,
		},
	});
});

test("shows a metadata validation error instead of submitting invalid JSON", async () => {
	const onSubmit = vi.fn();

	renderComponent(ListingEditorForm, {
		mode: "create",
		submitLabel: "Create listing",
		onSubmit,
		listingTypeOptions,
		initialValue: {
			name: "Morning Charter",
			slug: "morning-charter",
		},
	});

	await userEvent.click(page.getByRole("button", { name: "Edit JSON" }));
	await userEvent.fill(page.getByLabelText("Metadata JSON"), "[]");
	await userEvent.click(page.getByRole("button", { name: "Create listing" }));

	await expect
		.element(page.getByText("Metadata must be a JSON object."))
		.toBeInTheDocument();
	expect(onSubmit).not.toHaveBeenCalled();
});
