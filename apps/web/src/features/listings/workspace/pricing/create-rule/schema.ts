import { z } from "zod";

const INTEGER_STRING_RE = /^-?\d+$/;

function parseRuleConditionJson(value: string) {
	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {
				ok: false as const,
				message: "Condition JSON must be a JSON object.",
			};
		}

		return {
			ok: true as const,
			data: parsed as Record<string, unknown>,
		};
	} catch {
		return {
			ok: false as const,
			message: "Condition JSON must be valid JSON.",
		};
	}
}

const integerString = (message: string) =>
	z.string().trim().regex(INTEGER_STRING_RE, message);

export const createPricingRuleSchema = z.object({
	pricingProfileId: z.string().trim().min(1, "Select a pricing profile."),
	name: z.string().trim().min(1, "Rule name is required.").max(120),
	ruleType: z.enum([
		"dayHourRange",
		"passengerCount",
		"dateRange",
		"duration",
		"dayOfWeek",
		"hourRange",
	]),
	conditionJsonText: z.string().superRefine((value, ctx) => {
		const result = parseRuleConditionJson(value);
		if (!result.ok) {
			ctx.addIssue({
				code: "custom",
				message: result.message,
			});
		}
	}),
	adjustmentType: z.enum(["percent", "flat_cents"]),
	adjustmentValue: integerString("Adjustment value must be a whole number."),
	priority: integerString("Priority must be a whole number."),
});

export { parseRuleConditionJson };
