export const listingTypeOptions = [
	{
		value: "vessel",
		label: "Vessel",
		isDefault: true,
		icon: null,
		metadataJsonSchema: {
			type: "object",
			properties: {
				captainIncluded: { type: "boolean" },
			},
		},
	},
	{
		value: "equipment",
		label: "Equipment",
		isDefault: false,
		icon: null,
		metadataJsonSchema: {},
	},
];
