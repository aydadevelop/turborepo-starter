import { getDefaultListingTypeSlug } from "./shared";
import type {
	ListingEditorContext,
	ListingEditorFormValues,
	ListingEditorInitialValue,
} from "./types";

const toOptionalNumberString = (value: number | null | undefined): string =>
	value === undefined || value === null ? "" : String(value);

const buildBoatRentDefaults = (
	boatRentProfile: ListingEditorInitialValue["serviceFamilyDetails"]["boatRent"]
) => ({
	boatRentCapacity: toOptionalNumberString(boatRentProfile?.capacity),
	boatRentCaptainMode: boatRentProfile?.captainMode ?? "captained_only",
	boatRentBasePort: boatRentProfile?.basePort ?? "",
	boatRentDepartureArea: boatRentProfile?.departureArea ?? "",
	boatRentFuelPolicy: boatRentProfile?.fuelPolicy ?? "included",
	boatRentDepositRequired: boatRentProfile?.depositRequired ?? false,
	boatRentInstantBookAllowed: boatRentProfile?.instantBookAllowed ?? false,
});

const buildExcursionDefaults = (
	excursionProfile: ListingEditorInitialValue["serviceFamilyDetails"]["excursion"]
) => ({
	excursionMeetingPoint: excursionProfile?.meetingPoint ?? "",
	excursionDurationMinutes: toOptionalNumberString(
		excursionProfile?.durationMinutes
	),
	excursionGroupFormat: excursionProfile?.groupFormat ?? "group",
	excursionMaxGroupSize: toOptionalNumberString(excursionProfile?.maxGroupSize),
	excursionPrimaryLanguage: excursionProfile?.primaryLanguage ?? "",
	excursionTicketsIncluded: excursionProfile?.ticketsIncluded ?? false,
	excursionChildFriendly: excursionProfile?.childFriendly ?? false,
	excursionInstantBookAllowed: excursionProfile?.instantBookAllowed ?? true,
});

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
			initialValue?.listingTypeSlug ??
			getDefaultListingTypeSlug(listingTypeOptions),
		name: initialValue?.name ?? "",
		slug: initialValue?.slug ?? "",
		timezone: initialValue?.timezone ?? "UTC",
		description: initialValue?.description ?? "",
		metadataText: JSON.stringify(initialValue?.metadata ?? {}, null, 2),
		...buildBoatRentDefaults(boatRentProfile),
		...buildExcursionDefaults(excursionProfile),
	};
}
