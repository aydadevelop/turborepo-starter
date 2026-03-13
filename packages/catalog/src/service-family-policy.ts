import type { ListingTypeOption, ListingTypeRow } from "./types";
import { getServiceFamilyPolicy } from "./service-families";

export { getServiceFamilyPolicy } from "./service-families";

export function toListingTypeOption(input: {
	defaultAmenityKeys: string[] | null;
	icon: string | null;
	isDefault: boolean;
	label: string;
	metadataJsonSchema: Record<string, unknown>;
	requiredFields: string[] | null;
	serviceFamily: ListingTypeRow["serviceFamily"];
	supportedPricingModels: string[] | null;
	value: string;
}): ListingTypeOption {
	return {
		defaultAmenityKeys: input.defaultAmenityKeys ?? [],
		icon: input.icon,
		isDefault: input.isDefault,
		label: input.label,
		metadataJsonSchema: input.metadataJsonSchema,
		requiredFields: input.requiredFields ?? [],
		serviceFamily: input.serviceFamily,
		serviceFamilyPolicy: getServiceFamilyPolicy(input.serviceFamily),
		supportedPricingModels: input.supportedPricingModels ?? [],
		value: input.value,
	};
}
