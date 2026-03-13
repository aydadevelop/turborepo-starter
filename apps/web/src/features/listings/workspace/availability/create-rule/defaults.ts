import type { CreateAvailabilityRuleFormValues } from "./types";

export function getCreateAvailabilityRuleDefaults(): CreateAvailabilityRuleFormValues {
	return {
		dayOfWeek: "1",
		startTime: "09:00",
		endTime: "18:00",
	};
}
