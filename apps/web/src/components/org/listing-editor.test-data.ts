import type { ListingTypeOption } from "$lib/orpc-types";

export const listingTypeOptions = [
	{
		value: "vessel",
		label: "Vessel",
		isDefault: true,
		icon: null,
		serviceFamily: "boat_rent",
		serviceFamilyPolicy: {
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
					},
					{
						key: "captainMode",
						label: "Captain policy",
						kind: "enum",
						required: true,
						options: [
							{ value: "captained_only", label: "Captain included" },
							{ value: "self_drive_only", label: "Self-drive only" },
							{ value: "captain_optional", label: "Captain optional" },
						],
					},
					{ key: "basePort", label: "Base port", kind: "text", required: true },
					{
						key: "departureArea",
						label: "Departure area",
						kind: "text",
						required: true,
					},
					{
						key: "fuelPolicy",
						label: "Fuel policy",
						kind: "enum",
						required: true,
						options: [
							{ value: "included", label: "Fuel included" },
							{
								value: "charged_by_usage",
								label: "Fuel charged by usage",
							},
							{
								value: "return_same_level",
								label: "Return with same fuel level",
							},
						],
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
		},
		defaultAmenityKeys: ["captain", "audio-system"],
		metadataJsonSchema: {
			type: "object",
			properties: {
				captainIncluded: { type: "boolean" },
			},
		},
		requiredFields: ["name", "slug", "timezone"],
		supportedPricingModels: ["hourly", "package"],
	},
	{
		value: "equipment",
		label: "Equipment",
		isDefault: false,
		icon: null,
		serviceFamily: "boat_rent",
		serviceFamilyPolicy: {
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
					},
					{
						key: "captainMode",
						label: "Captain policy",
						kind: "enum",
						required: true,
						options: [
							{ value: "captained_only", label: "Captain included" },
							{ value: "self_drive_only", label: "Self-drive only" },
							{ value: "captain_optional", label: "Captain optional" },
						],
					},
					{ key: "basePort", label: "Base port", kind: "text", required: true },
					{
						key: "departureArea",
						label: "Departure area",
						kind: "text",
						required: true,
					},
					{
						key: "fuelPolicy",
						label: "Fuel policy",
						kind: "enum",
						required: true,
						options: [
							{ value: "included", label: "Fuel included" },
							{
								value: "charged_by_usage",
								label: "Fuel charged by usage",
							},
							{
								value: "return_same_level",
								label: "Return with same fuel level",
							},
						],
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
		},
		defaultAmenityKeys: [],
		metadataJsonSchema: {},
		requiredFields: ["name", "slug"],
		supportedPricingModels: ["hourly"],
	},
	{
		value: "walking-tour",
		label: "Walking tour",
		isDefault: false,
		icon: null,
		serviceFamily: "excursions",
		serviceFamilyPolicy: {
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
					},
					{
						key: "durationMinutes",
						label: "Duration (minutes)",
						kind: "integer",
						required: true,
					},
					{
						key: "groupFormat",
						label: "Group format",
						kind: "enum",
						required: true,
						options: [
							{ value: "group", label: "Group tour" },
							{ value: "private", label: "Private tour" },
							{ value: "both", label: "Private or group" },
						],
					},
					{
						key: "maxGroupSize",
						label: "Max group size",
						kind: "integer",
						required: true,
					},
					{
						key: "primaryLanguage",
						label: "Primary language",
						kind: "text",
						required: true,
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
		},
		defaultAmenityKeys: ["guide", "walking"],
		metadataJsonSchema: {},
		requiredFields: ["name", "slug", "timezone", "meetingPoint"],
		supportedPricingModels: ["ticket", "group"],
	},
] satisfies ListingTypeOption[];
