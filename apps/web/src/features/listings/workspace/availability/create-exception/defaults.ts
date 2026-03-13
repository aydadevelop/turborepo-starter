import type { CreateAvailabilityExceptionFormValues } from "./types";

export function getCreateAvailabilityExceptionDefaults(): CreateAvailabilityExceptionFormValues {
	return {
		date: "",
		isAvailable: false,
		startTime: "",
		endTime: "",
		reason: "",
	};
}
