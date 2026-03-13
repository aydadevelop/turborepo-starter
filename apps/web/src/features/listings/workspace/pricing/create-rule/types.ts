export interface CreatePricingRuleFormValues {
	adjustmentType: "flat_cents" | "percent";
	adjustmentValue: string;
	conditionJsonText: string;
	name: string;
	pricingProfileId: string;
	priority: string;
	ruleType:
		| "dateRange"
		| "dayHourRange"
		| "dayOfWeek"
		| "duration"
		| "hourRange"
		| "passengerCount";
}
