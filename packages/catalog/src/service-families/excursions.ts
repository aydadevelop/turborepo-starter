import type {
	ListingExcursionGroupFormat,
	ListingExcursionProfileInput,
	ListingExcursionProfileState,
	ListingServiceFamilyPolicy,
	StorefrontExcursionSummary,
} from "../types";

const groupFormatLabels: Record<ListingExcursionGroupFormat, string> = {
	group: "Group tour",
	private: "Private tour",
	both: "Private or group",
};

function toDurationLabel(durationMinutes: number | null): string | null {
	if (durationMinutes === null) {
		return null;
	}

	if (durationMinutes % 60 === 0) {
		const hours = durationMinutes / 60;
		return `${hours} hour${hours === 1 ? "" : "s"}`;
	}

	return `${durationMinutes} min`;
}

export const excursionsServiceFamilyPolicy: ListingServiceFamilyPolicy = {
	key: "excursions",
	label: "Excursions",
	availabilityMode: "schedule",
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
		moderationRequired: true,
	},
	customerPresentation: {
		bookingMode: "book",
		customerFocus: "experience",
		reviewsMode: "validated",
	},
	profileEditor: {
		title: "Excursion profile",
		description:
			"Experience and schedule facts that shape how this excursion is presented and booked.",
		fields: [
			{
				key: "meetingPoint",
				label: "Meeting point",
				kind: "text",
				required: true,
				helpText:
					"Where guests meet the guide or operator before the excursion starts.",
			},
			{
				key: "durationMinutes",
				label: "Duration (minutes)",
				kind: "integer",
				required: true,
				helpText:
					"Expected excursion duration used in customer-facing copy and operations.",
			},
			{
				key: "groupFormat",
				label: "Group format",
				kind: "enum",
				required: true,
				options: Object.entries(groupFormatLabels).map(([value, label]) => ({
					value,
					label,
				})),
			},
			{
				key: "maxGroupSize",
				label: "Max group size",
				kind: "integer",
				required: true,
				helpText:
					"Maximum number of guests this excursion format is designed to handle.",
			},
			{
				key: "primaryLanguage",
				label: "Primary language",
				kind: "text",
				required: true,
				helpText:
					"Main excursion language shown in the customer-facing summary.",
			},
			{
				key: "ticketsIncluded",
				label: "Tickets included",
				kind: "boolean",
				required: true,
			},
			{
				key: "childFriendly",
				label: "Child friendly",
				kind: "boolean",
				required: true,
			},
			{
				key: "instantBookAllowed",
				label: "Instant confirmation allowed",
				kind: "boolean",
				required: true,
			},
		],
	},
};

export function normalizeExcursionProfileInput(
	input?: ListingExcursionProfileInput | null
): ListingExcursionProfileInput {
	return {
		meetingPoint: input?.meetingPoint?.trim() || null,
		durationMinutes: input?.durationMinutes ?? null,
		groupFormat: input?.groupFormat ?? "group",
		maxGroupSize: input?.maxGroupSize ?? null,
		primaryLanguage: input?.primaryLanguage?.trim() || null,
		ticketsIncluded: input?.ticketsIncluded ?? false,
		childFriendly: input?.childFriendly ?? false,
		instantBookAllowed: input?.instantBookAllowed ?? true,
	};
}

export function toStorefrontExcursionSummary(
	profile: ListingExcursionProfileState | null
): StorefrontExcursionSummary | null {
	if (!profile) {
		return null;
	}

	return {
		meetingPoint: profile.meetingPoint,
		durationMinutes: profile.durationMinutes,
		durationLabel: toDurationLabel(profile.durationMinutes),
		groupFormat: profile.groupFormat,
		groupFormatLabel: groupFormatLabels[profile.groupFormat],
		maxGroupSize: profile.maxGroupSize,
		primaryLanguage: profile.primaryLanguage,
		ticketsIncluded: profile.ticketsIncluded,
		childFriendly: profile.childFriendly,
		instantBookAllowed: profile.instantBookAllowed,
	};
}
