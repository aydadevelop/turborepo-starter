import type { MutationResult } from "$lib/mutation-result";
import type { OrpcInputs } from "$lib/orpc-types";

import type { CreateAvailabilityRuleFormValues } from "./types";

export type CreateAvailabilityRuleInput = OrpcInputs["availability"]["addRule"];

function parseMinute(time: string): number {
	const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
	return hours * 60 + minutes;
}

export function buildCreateAvailabilityRuleInput(
	listingId: string,
	values: CreateAvailabilityRuleFormValues
): MutationResult<CreateAvailabilityRuleInput> {
	const dayOfWeek = Number.parseInt(values.dayOfWeek, 10);
	if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
		return { ok: false, message: "Select a valid day of the week." };
	}

	const startMinute = parseMinute(values.startTime);
	const endMinute = parseMinute(values.endTime);

	if (endMinute <= startMinute) {
		return { ok: false, message: "End time must be later than start time." };
	}

	return {
		ok: true,
		data: {
			listingId,
			dayOfWeek,
			startMinute,
			endMinute,
		},
	};
}
