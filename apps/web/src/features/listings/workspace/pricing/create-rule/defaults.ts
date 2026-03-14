import type { PricingWorkspaceState } from "$lib/orpc-types";

import type { CreatePricingRuleFormValues } from "./types";

export function getCreatePricingRuleDefaults(
	pricing: PricingWorkspaceState | null | undefined,
): CreatePricingRuleFormValues {
	return {
		pricingProfileId:
			pricing?.defaultProfileId ?? pricing?.profiles[0]?.id ?? "",
		name: "",
		ruleType: "dayOfWeek",
		conditionJsonText: "{}",
		adjustmentType: "percent",
		adjustmentValue: "10",
		priority: "0",
	};
}
