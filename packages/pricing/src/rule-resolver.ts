export type RuleType =
	| "dayHourRange"
	| "passengerCount"
	| "dateRange"
	| "duration"
	| "dayOfWeek"
	| "hourRange";

export interface PricingRuleBehavior {
	conflictMode: "explicit" | "stackable" | "explicitExclusive";
	primaryCategory: "time" | "date" | "bookingAttribute" | "other";
}

export const PRICING_RULE_BEHAVIORS: Record<RuleType, PricingRuleBehavior> = {
	dayHourRange: { conflictMode: "explicit", primaryCategory: "time" },
	hourRange: { conflictMode: "explicit", primaryCategory: "time" },
	dayOfWeek: { conflictMode: "explicit", primaryCategory: "time" },
	dateRange: { conflictMode: "explicitExclusive", primaryCategory: "date" },
	passengerCount: { conflictMode: "stackable", primaryCategory: "bookingAttribute" },
	duration: { conflictMode: "stackable", primaryCategory: "bookingAttribute" },
};

export function getRuleBehavior(ruleType: string): PricingRuleBehavior {
	const behavior = PRICING_RULE_BEHAVIORS[ruleType as RuleType];
	if (!behavior) {
		return { conflictMode: "stackable", primaryCategory: "other" };
	}
	return behavior;
}

/**
 * Given a set of pricing rules and a predicate to test applicability,
 * returns the subset of rules that should apply, based on conflict modes.
 * - explicitExclusive rules take highest precedence (highest priority wins)
 * - explicit rules: pick highest-priority one
 * - stackable rules: pick best per primaryCategory
 */
export function resolveApplicableRules<
	T extends { ruleType: string; priority: number },
>(rules: T[], applies: (rule: T) => boolean): T[] {
	const exclusive = rules
		.filter((r) => {
			const b = getRuleBehavior(r.ruleType);
			return b.conflictMode === "explicitExclusive" && applies(r);
		})
		.sort((a, b) => b.priority - a.priority);

	const stackable = rules.filter((r) => {
		const b = getRuleBehavior(r.ruleType);
		return b.conflictMode === "stackable" && applies(r);
	});

	if (exclusive.length > 0) {
		const chosen = exclusive[0]!;
		const result: T[] = [chosen];
		const grouped: Record<string, T[]> = {};
		for (const r of stackable) {
			const cat = getRuleBehavior(r.ruleType).primaryCategory;
			if (!grouped[cat]) grouped[cat] = [];
			grouped[cat]!.push(r);
		}
		for (const group of Object.values(grouped)) {
			const best = group.sort((a, b) => b.priority - a.priority)[0]!;
			if (!result.includes(best)) result.push(best);
		}
		return result;
	}

	const explicit = rules
		.filter((r) => {
			const b = getRuleBehavior(r.ruleType);
			return b.conflictMode === "explicit" && applies(r);
		})
		.sort((a, b) => b.priority - a.priority);

	const result: T[] = [];
	if (explicit.length > 0) result.push(explicit[0]!);

	const grouped: Record<string, T[]> = {};
	for (const r of stackable) {
		const cat = getRuleBehavior(r.ruleType).primaryCategory;
		if (!grouped[cat]) grouped[cat] = [];
		grouped[cat]!.push(r);
	}
	for (const group of Object.values(grouped)) {
		const best = group.sort((a, b) => b.priority - a.priority)[0]!;
		if (!result.includes(best)) result.push(best);
	}

	return result;
}
