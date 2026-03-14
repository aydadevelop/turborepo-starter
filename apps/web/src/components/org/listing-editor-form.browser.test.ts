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
	await expect(document.body).toMatchScreenshot("listing-editor-form");

	await userEvent.fill(page.getByLabelText("Name"), "Evening Charter");
	await userEvent.fill(page.getByLabelText("Slug"), "evening-charter");
	await userEvent.selectOptions(
		page.getByLabelText("Timezone"),
		"Europe/Berlin"
	);
	await userEvent.fill(page.getByLabelText("Capacity"), "10");
	await userEvent.selectOptions(
		page.getByLabelText("Captain policy"),
		"captained_only"
	);
	await userEvent.fill(
		page.getByLabelText("Base port"),
		"Sochi Marine Station"
	);
	await userEvent.fill(
		page.getByLabelText("Departure area"),
		"Imeretinskaya Bay"
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
		serviceFamilyDetails: {
			boatRent: {
				basePort: "Sochi Marine Station",
				capacity: 10,
				captainMode: "captained_only",
				departureArea: "Imeretinskaya Bay",
				depositRequired: false,
				fuelPolicy: "included",
				instantBookAllowed: false,
			},
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
	await expect(document.body).toMatchScreenshot(
		"listing-editor-form-invalid-json"
	);

	await userEvent.click(page.getByRole("button", { name: "Edit JSON" }));
	await userEvent.fill(page.getByLabelText("Metadata JSON"), "[]");
	await userEvent.click(page.getByRole("button", { name: "Create listing" }));

	await expect
		.element(page.getByText("Metadata must be a JSON object."))
		.toBeInTheDocument();
	expect(onSubmit).not.toHaveBeenCalled();
});

test("uses backend-seeded initial defaults for create flows", async () => {
	renderComponent(ListingEditorForm, {
		mode: "create",
		submitLabel: "Create listing",
		onSubmit: vi.fn(),
		listingTypeOptions,
		initialValue: {
			timezone: "Europe/Moscow",
		},
	});

	await expect
		.element(page.getByLabelText("Timezone"))
		.toHaveValue("Europe/Moscow");
});

test("renders and submits typed excursion fields when an excursion type is selected", async () => {
	const onSubmit = vi.fn();

	renderComponent(ListingEditorForm, {
		mode: "create",
		submitLabel: "Create listing",
		onSubmit,
		listingTypeOptions,
	});
	await expect(document.body).toMatchScreenshot(
		"listing-editor-form-excursion"
	);

	await userEvent.click(page.getByLabelText("Listing type"));
	await userEvent.click(page.getByRole("option", { name: "Walking tour" }));
	await userEvent.fill(page.getByLabelText("Name"), "Historic center walk");
	await userEvent.fill(page.getByLabelText("Slug"), "historic-center-walk");
	await userEvent.selectOptions(
		page.getByLabelText("Timezone"),
		"Europe/Berlin"
	);
	await userEvent.fill(
		page.getByLabelText("Meeting point"),
		"Central fountain"
	);
	await userEvent.fill(page.getByLabelText("Duration (minutes)"), "180");
	await userEvent.selectOptions(page.getByLabelText("Group format"), "both");
	await userEvent.fill(page.getByLabelText("Max group size"), "12");
	await userEvent.fill(page.getByLabelText("Primary language"), "English");
	await userEvent.click(page.getByLabelText("Tickets included"));
	await userEvent.click(page.getByRole("button", { name: "Create listing" }));

	expect(onSubmit).toHaveBeenCalledWith({
		listingTypeSlug: "walking-tour",
		name: "Historic center walk",
		slug: "historic-center-walk",
		timezone: "Europe/Berlin",
		description: undefined,
		metadata: {},
		serviceFamilyDetails: {
			excursion: {
				meetingPoint: "Central fountain",
				durationMinutes: 180,
				groupFormat: "both",
				maxGroupSize: 12,
				primaryLanguage: "English",
				ticketsIncluded: true,
				childFriendly: false,
				instantBookAllowed: true,
			},
		},
	});
});
