import type { PricingWorkspaceState } from "$lib/orpc-types";

import type { CreatePricingProfileFormValues } from "./types";

export function getCreatePricingProfileDefaults(
	pricing: PricingWorkspaceState | null | undefined
): CreatePricingProfileFormValues {
	return {
		name: "",
		currency: pricing?.currencies[0] ?? "RUB",
		baseHourlyPriceCents: "",
		minimumHours: "1",
		serviceFeeBps: "0",
		taxBps: "0",
		isDefault: !pricing?.defaultProfileId,
	};
}
