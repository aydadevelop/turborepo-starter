import type {
	ListingBoatRentProfileState,
	ListingExcursionProfileState,
	ListingTypeOption,
	OrpcInputs,
} from "$lib/orpc-types";

export type ListingEditorMode = "create" | "edit";

export type ListingEditorSubmitValues = OrpcInputs["listing"]["create"];

export interface ListingEditorInitialValue {
	description?: string | null;
	listingTypeSlug?: string;
	metadata?: Record<string, unknown> | null;
	name?: string;
	serviceFamilyDetails?: {
		boatRent?: Partial<ListingBoatRentProfileState> | null;
		excursion?: Partial<ListingExcursionProfileState> | null;
	};
	slug?: string;
	timezone?: string | null;
}

export interface ListingEditorFormValues {
	boatRentBasePort: string;
	boatRentCapacity: string;
	boatRentCaptainMode: ListingBoatRentProfileState["captainMode"];
	boatRentDepartureArea: string;
	boatRentDepositRequired: boolean;
	boatRentFuelPolicy: ListingBoatRentProfileState["fuelPolicy"];
	boatRentInstantBookAllowed: boolean;
	description: string;
	excursionChildFriendly: boolean;
	excursionDurationMinutes: string;
	excursionGroupFormat: ListingExcursionProfileState["groupFormat"];
	excursionInstantBookAllowed: boolean;
	excursionMaxGroupSize: string;
	excursionMeetingPoint: string;
	excursionPrimaryLanguage: string;
	excursionTicketsIncluded: boolean;
	listingTypeSlug: string;
	metadataText: string;
	name: string;
	slug: string;
	timezone: string;
}

export interface ListingEditorContext {
	listingTypeOptions: ListingTypeOption[];
	mode: ListingEditorMode;
}
