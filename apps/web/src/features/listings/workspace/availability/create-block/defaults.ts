import type { CreateAvailabilityBlockFormValues } from "./types";

export function getCreateAvailabilityBlockDefaults(): CreateAvailabilityBlockFormValues {
	return {
		startsAt: "",
		endsAt: "",
		reason: "",
	};
}
