import type { MutationResult } from "$lib/mutation-result";
import type { OrpcInputs } from "$lib/orpc-types";

import { parseRuleConditionJson } from "./schema";
import type { CreatePricingRuleFormValues } from "./types";

export type CreatePricingRuleInput = OrpcInputs["pricing"]["addRule"];

function parseInteger(value: string, message: string): MutationResult<number> {
	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isInteger(parsed)) {
		return { ok: false, message };
	}

	return { ok: true, data: parsed };
}

export function buildCreatePricingRuleInput(
	listingId: string,
	values: CreatePricingRuleFormValues
): MutationResult<CreatePricingRuleInput> {
	const conditionResult = parseRuleConditionJson(values.conditionJsonText);
	if (!conditionResult.ok) {
		return { ok: false, message: conditionResult.message };
	}

	const adjustmentValueResult = parseInteger(
		values.adjustmentValue,
		"Adjustment value must be a whole number."
	);
	if (!adjustmentValueResult.ok) {
		return adjustmentValueResult;
	}

	const priorityResult = parseInteger(
		values.priority,
		"Priority must be a whole number."
	);
	if (!priorityResult.ok) {
		return priorityResult;
	}

	return {
		ok: true,
		data: {
			listingId,
			pricingProfileId: values.pricingProfileId,
			name: values.name.trim(),
			ruleType: values.ruleType,
			conditionJson: conditionResult.data,
			adjustmentType: values.adjustmentType,
			adjustmentValue: adjustmentValueResult.data,
			priority: priorityResult.data,
		},
	};
}
