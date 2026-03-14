import type {
	ListingBoatRentProfileInput,
	ListingBoatRentProfileState,
	ListingExcursionProfileInput,
	ListingExcursionProfileState,
	ListingServiceFamily,
	ListingServiceFamilyPolicy,
	StorefrontBoatRentSummary,
	StorefrontExcursionSummary,
} from "../types";
import { boatRentServiceFamilyPolicy } from "./boat-rent";
import { excursionsServiceFamilyPolicy } from "./excursions";

// biome-ignore lint/performance/noBarrelFile: Internal service-family aggregator re-exports policy helpers for catalog modules.
export {
	boatRentServiceFamilyPolicy,
	normalizeBoatRentProfileInput,
	toStorefrontBoatRentSummary,
} from "./boat-rent";
export {
	excursionsServiceFamilyPolicy,
	normalizeExcursionProfileInput,
	toStorefrontExcursionSummary,
} from "./excursions";

const SERVICE_FAMILY_POLICIES: Record<
	ListingServiceFamily,
	ListingServiceFamilyPolicy
> = {
	boat_rent: boatRentServiceFamilyPolicy,
	excursions: excursionsServiceFamilyPolicy,
};

export function getServiceFamilyPolicy(
	serviceFamily: ListingServiceFamily
): ListingServiceFamilyPolicy {
	return SERVICE_FAMILY_POLICIES[serviceFamily];
}

export function getEmptyBoatRentProfileState(
	listingId: string
): ListingBoatRentProfileState {
	return {
		listingId,
		capacity: null,
		captainMode: "captained_only",
		basePort: null,
		departureArea: null,
		fuelPolicy: "included",
		depositRequired: false,
		instantBookAllowed: false,
	};
}

export function getEmptyExcursionProfileState(
	listingId: string
): ListingExcursionProfileState {
	return {
		listingId,
		meetingPoint: null,
		durationMinutes: null,
		groupFormat: "group",
		maxGroupSize: null,
		primaryLanguage: null,
		ticketsIncluded: false,
		childFriendly: false,
		instantBookAllowed: true,
	};
}

export interface ListingServiceFamilyInputShape {
	boatRent?: ListingBoatRentProfileInput;
	excursion?: ListingExcursionProfileInput;
}

export interface ListingServiceFamilyStorefrontSummary {
	boatRent: StorefrontBoatRentSummary | null;
	excursion: StorefrontExcursionSummary | null;
}
