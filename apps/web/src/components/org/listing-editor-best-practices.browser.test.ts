import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "../../test/browser/render";
import ListingEditorForm from "./ListingEditorForm.svelte";
import { listingTypeOptions } from "./listing-editor.test-data";

test("keeps governed fields primary and raw metadata hidden by default", async () => {
	renderComponent(ListingEditorForm, {
		mode: "create",
		submitLabel: "Create listing",
		onSubmit: () => Promise.resolve(),
		listingTypeOptions,
	});

	await expect.element(page.getByLabelText("Listing type")).toBeVisible();
	await expect.element(page.getByLabelText("Timezone")).toBeVisible();
	await expect.element(page.getByLabelText("Name")).toBeVisible();
	await expect.element(page.getByLabelText("Slug")).toBeVisible();
	await expect.element(page.getByLabelText("Description")).toBeVisible();
	await expect
		.element(page.getByText("Service family: Boat rent"))
		.toBeVisible();
	await expect
		.element(
			page.getByText("Required fields for this type: name, slug, timezone"),
		)
		.toBeVisible();
	await expect.element(page.getByLabelText("Capacity")).toBeVisible();
	await expect.element(page.getByLabelText("Captain policy")).toBeVisible();
	await expect.element(page.getByText("Advanced metadata")).toBeVisible();
	await expect
		.element(
			page.getByText(
				"Use raw JSON only for listing-type fields that do not yet have a typed editor.",
			),
		)
		.toBeVisible();
	await expect.element(page.getByLabelText("Metadata JSON")).not.toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"listing-editor-best-practices-default",
	);

	await userEvent.click(page.getByRole("button", { name: "Edit JSON" }));

	await expect.element(page.getByLabelText("Metadata JSON")).toBeVisible();
	await expect
		.element(
			page.getByText(
				"Metadata must be a JSON object. Leave it empty unless you need fields that are not modeled directly in the form yet.",
			),
		)
		.toBeVisible();
	await expect.element(page.getByText("Boat rent profile")).toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"listing-editor-best-practices-advanced-json",
	);
});

test("switches to typed excursion fields instead of falling back to generic metadata for excursions", async () => {
	renderComponent(ListingEditorForm, {
		mode: "create",
		submitLabel: "Create listing",
		onSubmit: () => Promise.resolve(),
		listingTypeOptions,
	});

	await userEvent.click(page.getByLabelText("Listing type"));
	await userEvent.click(page.getByRole("option", { name: "Walking tour" }));

	await expect
		.element(page.getByText("Service family: Excursions"))
		.toBeVisible();
	await expect.element(page.getByLabelText("Meeting point")).toBeVisible();
	await expect.element(page.getByLabelText("Duration (minutes)")).toBeVisible();
	await expect.element(page.getByLabelText("Group format")).toBeVisible();
	await expect.element(page.getByLabelText("Primary language")).toBeVisible();
	await expect.element(page.getByText("Excursion profile")).toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"listing-editor-best-practices-excursion",
	);
});

test.todo(
	"shows readiness and moderation state in the listing workspace before publish actions are available",
);

test.todo(
	"splits pricing, availability, assets, and calendar configuration into dedicated workspace sections instead of one basic form",
);
