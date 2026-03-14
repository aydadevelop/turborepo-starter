import type { MutationResult } from "$lib/mutation-result";
import type { OrpcInputs } from "$lib/orpc-types";

import type { CreateAvailabilityBlockFormValues } from "./types";

export type CreateAvailabilityBlockInput =
	OrpcInputs["availability"]["addBlock"];

export function buildCreateAvailabilityBlockInput(
	listingId: string,
	values: CreateAvailabilityBlockFormValues
): MutationResult<CreateAvailabilityBlockInput> {
	const startsAt = new Date(values.startsAt);
	const endsAt = new Date(values.endsAt);

	if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
		return { ok: false, message: "Provide valid date and time values." };
	}

	if (endsAt <= startsAt) {
		return { ok: false, message: "End time must be later than start time." };
	}

	return {
		ok: true,
		data: {
			listingId,
			startsAt: startsAt.toISOString(),
			endsAt: endsAt.toISOString(),
			reason: values.reason.trim() || undefined,
		},
	};
}
