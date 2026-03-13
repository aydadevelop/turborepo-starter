import type {
	ListingEditorContext,
	ListingEditorFormValues,
	ListingEditorInitialValue,
} from "./types";
import { getDefaultListingTypeSlug } from "./shared";

export function getListingEditorDefaults({
	initialValue,
	listingTypeOptions,
}: {
	initialValue?: ListingEditorInitialValue;
} & ListingEditorContext): ListingEditorFormValues {
	const boatRentProfile = initialValue?.serviceFamilyDetails?.boatRent;
	const excursionProfile = initialValue?.serviceFamilyDetails?.excursion;

	return {
		listingTypeSlug:
			initialValue?.listingTypeSlug ?? getDefaultListingTypeSlug(listingTypeOptions),
		name: initialValue?.name ?? "",
		slug: initialValue?.slug ?? "",
		timezone: initialValue?.timezone ?? "UTC",
		description: initialValue?.description ?? "",
		metadataText: JSON.stringify(initialValue?.metadata ?? {}, null, 2),
		boatRentCapacity:
			boatRentProfile?.capacity === undefined || boatRentProfile?.capacity === null
				? ""
				: String(boatRentProfile.capacity),
		boatRentCaptainMode: boatRentProfile?.captainMode ?? "captained_only",
		boatRentBasePort: boatRentProfile?.basePort ?? "",
		boatRentDepartureArea: boatRentProfile?.departureArea ?? "",
		boatRentFuelPolicy: boatRentProfile?.fuelPolicy ?? "included",
		boatRentDepositRequired: boatRentProfile?.depositRequired ?? false,
		boatRentInstantBookAllowed: boatRentProfile?.instantBookAllowed ?? false,
		excursionMeetingPoint: excursionProfile?.meetingPoint ?? "",
		excursionDurationMinutes:
			excursionProfile?.durationMinutes === undefined ||
			excursionProfile?.durationMinutes === null
				? ""
				: String(excursionProfile.durationMinutes),
		excursionGroupFormat: excursionProfile?.groupFormat ?? "group",
		excursionMaxGroupSize:
			excursionProfile?.maxGroupSize === undefined ||
			excursionProfile?.maxGroupSize === null
				? ""
				: String(excursionProfile.maxGroupSize),
		excursionPrimaryLanguage: excursionProfile?.primaryLanguage ?? "",
		excursionTicketsIncluded: excursionProfile?.ticketsIncluded ?? false,
		excursionChildFriendly: excursionProfile?.childFriendly ?? false,
		excursionInstantBookAllowed: excursionProfile?.instantBookAllowed ?? true,
	};
}
