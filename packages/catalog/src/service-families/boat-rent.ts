import type {
	ListingBoatRentCaptainMode,
	ListingBoatRentFuelPolicy,
	ListingBoatRentProfileInput,
	ListingBoatRentProfileState,
	ListingServiceFamilyPolicy,
	StorefrontBoatRentSummary,
} from "../types";

const captainModeLabels: Record<ListingBoatRentCaptainMode, string> = {
	captained_only: "Captain included",
	self_drive_only: "Self-drive only",
	captain_optional: "Captain optional",
};

const fuelPolicyLabels: Record<ListingBoatRentFuelPolicy, string> = {
	included: "Fuel included",
	charged_by_usage: "Fuel charged by usage",
	return_same_level: "Return with same fuel level",
};

export const boatRentServiceFamilyPolicy: ListingServiceFamilyPolicy = {
	key: "boat_rent",
	label: "Boat rent",
	availabilityMode: "duration",
	operatorSections: [
		"basics",
		"pricing",
		"availability",
		"assets",
		"calendar",
		"publish",
	],
	defaults: {
		requiresLocation: true,
		moderationRequired: false,
	},
	customerPresentation: {
		bookingMode: "request",
		customerFocus: "asset",
		reviewsMode: "standard",
	},
	profileEditor: {
		title: "Boat rent profile",
		description:
			"Core operating facts that shape how this listing is sold and requested.",
		fields: [
			{
				key: "capacity",
				label: "Capacity",
				kind: "integer",
				required: true,
				helpText: "Maximum guest count for this boat.",
			},
			{
				key: "captainMode",
				label: "Captain policy",
				kind: "enum",
				required: true,
				options: Object.entries(captainModeLabels).map(([value, label]) => ({
					value,
					label,
				})),
			},
			{
				key: "basePort",
				label: "Base port",
				kind: "text",
				required: true,
				helpText: "Default marina or departure port shown to customers.",
			},
			{
				key: "departureArea",
				label: "Departure area",
				kind: "text",
				required: true,
				helpText: "Human-friendly area label used in search and storefront copy.",
			},
			{
				key: "fuelPolicy",
				label: "Fuel policy",
				kind: "enum",
				required: true,
				options: Object.entries(fuelPolicyLabels).map(([value, label]) => ({
					value,
					label,
				})),
			},
			{
				key: "depositRequired",
				label: "Deposit required",
				kind: "boolean",
				required: true,
			},
			{
				key: "instantBookAllowed",
				label: "Instant book allowed",
				kind: "boolean",
				required: true,
			},
		],
	},
};

export function normalizeBoatRentProfileInput(
	input?: ListingBoatRentProfileInput | null
): ListingBoatRentProfileInput {
	return {
		capacity: input?.capacity ?? null,
		captainMode: input?.captainMode ?? "captained_only",
		basePort: input?.basePort?.trim() || null,
		departureArea: input?.departureArea?.trim() || null,
		fuelPolicy: input?.fuelPolicy ?? "included",
		depositRequired: input?.depositRequired ?? false,
		instantBookAllowed: input?.instantBookAllowed ?? false,
	};
}

export function toStorefrontBoatRentSummary(
	profile: ListingBoatRentProfileState | null
): StorefrontBoatRentSummary | null {
	if (!profile) {
		return null;
	}

	return {
		basePort: profile.basePort,
		capacity: profile.capacity,
		captainMode: profile.captainMode,
		captainModeLabel: captainModeLabels[profile.captainMode],
		departureArea: profile.departureArea,
		depositRequired: profile.depositRequired,
		fuelPolicy: profile.fuelPolicy,
		fuelPolicyLabel: fuelPolicyLabels[profile.fuelPolicy],
		instantBookAllowed: profile.instantBookAllowed,
	};
}
