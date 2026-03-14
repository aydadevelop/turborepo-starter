import type { MutationResult } from "$lib/mutation-result";
import type { OrpcInputs } from "$lib/orpc-types";

import type { CreateAvailabilityExceptionFormValues } from "./types";

const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CreateAvailabilityExceptionInput =
	OrpcInputs["availability"]["addException"];

function parseMinute(time: string): number {
	const [hours, minutes] = time
		.split(":")
		.map((part) => Number.parseInt(part, 10));
	return hours * 60 + minutes;
}

export function buildCreateAvailabilityExceptionInput(
	listingId: string,
	values: CreateAvailabilityExceptionFormValues,
): MutationResult<CreateAvailabilityExceptionInput> {
	if (!values.date.match(DATE_STRING_RE)) {
		return { ok: false, message: "Select a valid date." };
	}

	if (!values.isAvailable) {
		return {
			ok: true,
			data: {
				listingId,
				date: values.date,
				isAvailable: false,
				reason: values.reason.trim() || undefined,
			},
		};
	}

	if (!(values.startTime && values.endTime)) {
		return {
			ok: false,
			message:
				"Provide both start and end times for a partial-day available exception.",
		};
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
			date: values.date,
			isAvailable: true,
			startMinute,
			endMinute,
			reason: values.reason.trim() || undefined,
		},
	};
}
