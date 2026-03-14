import type { MutationResult } from "$lib/mutation-result";
import {
	findListingTypeOption,
	parseMetadataObject,
	parsePositiveInteger,
} from "./shared";
import type {
	ListingEditorContext,
	ListingEditorFormValues,
	ListingEditorSubmitValues,
} from "./types";

export function buildListingEditorSubmitValues(
	values: ListingEditorFormValues,
	{ listingTypeOptions }: ListingEditorContext
): MutationResult<ListingEditorSubmitValues> {
	const selectedListingType = findListingTypeOption(
		listingTypeOptions,
		values.listingTypeSlug
	);
	if (!selectedListingType) {
		return { ok: false, message: "Select a listing type." };
	}

	const metadataResult = parseMetadataObject(values.metadataText);
	if (!metadataResult.ok) {
		return { ok: false, message: metadataResult.message };
	}

	let serviceFamilyDetails: ListingEditorSubmitValues["serviceFamilyDetails"];

	if (selectedListingType.serviceFamily === "boat_rent") {
		const capacityResult = parsePositiveInteger(
			values.boatRentCapacity,
			"Capacity is required for boat-rent listings.",
			"Capacity must be a positive whole number for boat-rent listings."
		);
		if (!capacityResult.ok) {
			return { ok: false, message: capacityResult.message };
		}

		serviceFamilyDetails = {
			boatRent: {
				capacity: capacityResult.data,
				captainMode: values.boatRentCaptainMode,
				basePort: values.boatRentBasePort.trim(),
				departureArea: values.boatRentDepartureArea.trim(),
				fuelPolicy: values.boatRentFuelPolicy,
				depositRequired: values.boatRentDepositRequired,
				instantBookAllowed: values.boatRentInstantBookAllowed,
			},
		};
	}

	if (selectedListingType.serviceFamily === "excursions") {
		const durationResult = parsePositiveInteger(
			values.excursionDurationMinutes,
			"Duration is required for excursion listings.",
			"Duration must be a positive whole number of minutes for excursion listings."
		);
		if (!durationResult.ok) {
			return { ok: false, message: durationResult.message };
		}

		const groupSizeResult = parsePositiveInteger(
			values.excursionMaxGroupSize,
			"Max group size is required for excursion listings.",
			"Max group size must be a positive whole number for excursion listings."
		);
		if (!groupSizeResult.ok) {
			return { ok: false, message: groupSizeResult.message };
		}

		serviceFamilyDetails = {
			excursion: {
				meetingPoint: values.excursionMeetingPoint.trim(),
				durationMinutes: durationResult.data,
				groupFormat: values.excursionGroupFormat,
				maxGroupSize: groupSizeResult.data,
				primaryLanguage: values.excursionPrimaryLanguage.trim(),
				ticketsIncluded: values.excursionTicketsIncluded,
				childFriendly: values.excursionChildFriendly,
				instantBookAllowed: values.excursionInstantBookAllowed,
			},
		};
	}

	return {
		ok: true,
		data: {
			listingTypeSlug: values.listingTypeSlug.trim(),
			name: values.name.trim(),
			slug: values.slug.trim(),
			timezone: values.timezone.trim(),
			description: values.description.trim() || undefined,
			metadata: metadataResult.data,
			serviceFamilyDetails,
		},
	};
}
