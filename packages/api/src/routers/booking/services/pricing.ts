import type {
	boatPricingProfile,
	boatPricingRule,
} from "@full-stack-cf-app/db/schema/boat";

export type BoatPricingProfile = typeof boatPricingProfile.$inferSelect;
export type BoatPricingRule = typeof boatPricingRule.$inferSelect;

export interface BookingPricingQuote {
	profileId: string;
	currency: string;
	baseHourlyPriceCents: number;
	estimatedHours: number;
	/**
	 * The "boat subtotal" for the booking before platform fees.
	 * This is what the customer pays the captain/owner (often on-site), and is the
	 * base used for fee calculations.
	 */
	estimatedBasePriceCents: number;
	serviceFeePercentage: number;
	acquiringFeePercentage: number;
	taxPercentage: number;
	affiliateFeePercentage: number;
	/**
	 * Retained for pricing profile compatibility.
	 * Current settlement policy: customer prepay is only platform markup
	 * (`total - boat base`), so this percentage does not increase pay-now.
	 */
	depositPercentage: number;
	estimatedServiceFeeCents: number;
	estimatedAcquiringFeeCents: number;
	estimatedTaxCents: number;
	estimatedAffiliateFeeCents: number;
	/**
	 * Total the customer pays (boat subtotal + platform fees).
	 *
	 * Note: acquiring + tax are internal expenses (computed on platform fees), and
	 * are intentionally not included in the customer total.
	 */
	estimatedTotalPriceCents: number;
	/**
	 * Online amount ("pay now"): platform markup only (`total - boat base`).
	 */
	estimatedPayNowCents: number;
	/**
	 * Remaining amount ("pay later"): discounted boat base paid to owner/captain.
	 */
	estimatedPayLaterCents: number;
}

type PricingRuleCondition = Record<string, unknown>;
const MINUTE_MS = 60_000;

const WEEKDAY_MAP: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

const safeParseConditionJson = (raw: string): PricingRuleCondition => {
	if (!raw) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as PricingRuleCondition;
		}
		return {};
	} catch {
		return {};
	}
};

const asNumber = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asInteger = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isInteger(value) ? value : undefined;

const asNumberArray = (value: unknown): number[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const numbers = value.filter(
		(item): item is number => typeof item === "number" && Number.isFinite(item)
	);
	return numbers.length > 0 ? numbers : undefined;
};

const clampInt = (value: number, min: number, max: number) =>
	Math.min(Math.max(Math.trunc(value), min), max);

const percentageAmount = (base: number, percentage: number) =>
	Math.max(0, Math.round((base * Math.max(0, percentage)) / 100));

const percentageDelta = (base: number, percentage: number) =>
	Math.round((base * percentage) / 100);

const getLocalParts = (
	date: Date,
	timeZone: string
): { weekday: number; hour: number; minute: number; ymd: string } => {
	// Use a fixed locale to keep weekday strings stable.
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hour12: false,
		hourCycle: "h23",
	});
	const parts = dtf.formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value;
	const weekdayRaw = get("weekday") ?? "Sun";
	const hourRaw = get("hour") ?? "0";
	const minuteRaw = get("minute") ?? "0";
	const year = get("year") ?? "1970";
	const month = get("month") ?? "01";
	const day = get("day") ?? "01";

	return {
		weekday: WEEKDAY_MAP[weekdayRaw] ?? 0,
		hour: clampInt(Number.parseInt(hourRaw, 10), 0, 23),
		minute: clampInt(Number.parseInt(minuteRaw, 10), 0, 59),
		ymd: `${year}-${month}-${day}`,
	};
};

const rangeTouchesWeekday = (params: {
	startsAt: Date;
	endsAt: Date;
	timeZone: string;
	weekdaySet: Set<number>;
}) => {
	const endExclusive =
		params.endsAt.getTime() > params.startsAt.getTime()
			? new Date(params.endsAt.getTime() - 1)
			: params.endsAt;
	const visited = new Set<string>();
	for (
		let cursor = params.startsAt.getTime();
		cursor <= endExclusive.getTime();
		cursor += 86_400_000
	) {
		const local = getLocalParts(new Date(cursor), params.timeZone);
		if (visited.has(local.ymd)) {
			continue;
		}
		visited.add(local.ymd);
		if (params.weekdaySet.has(local.weekday)) {
			return true;
		}
	}
	return false;
};

const isMinuteInWindow = (params: {
	minuteOfDay: number;
	startHour: number;
	startMinute: number;
	endHour: number;
	endMinute: number;
}) => {
	const startHour = clampInt(params.startHour, 0, 23);
	const startMinute = clampInt(params.startMinute, 0, 59);
	const endHour = params.endHour === 24 ? 24 : clampInt(params.endHour, 0, 23);
	const endMinute = clampInt(params.endMinute, 0, 59);
	const minuteOfDay = clampInt(params.minuteOfDay, 0, 24 * 60 - 1);
	const start = startHour * 60 + startMinute;
	const end = endHour * 60 + endMinute;

	// A 0-24 (or N-N) window means "always".
	if (start === end) {
		return true;
	}

	if (start < end) {
		return minuteOfDay >= start && minuteOfDay < end;
	}

	// Cross-midnight, e.g. 20 -> 4
	return minuteOfDay >= start || minuteOfDay < end;
};

interface TimeWindowCondition {
	startHour: number;
	startMinute: number;
	endHour: number;
	endMinute: number;
	daysOfWeek: Set<number> | null;
}

const isValidHalfHourMinute = (value: number) => value === 0 || value === 30;

const parseTimeWindowCondition = (
	condition: PricingRuleCondition
): TimeWindowCondition | null => {
	const startHour = asInteger(condition.startHour);
	const endHour = asInteger(condition.endHour);
	if (startHour === undefined || endHour === undefined) {
		return null;
	}
	if (startHour < 0 || startHour > 23) {
		return null;
	}
	if (endHour < 0 || endHour > 24) {
		return null;
	}

	const startMinute = asInteger(condition.startMinute) ?? 0;
	const endMinute = asInteger(condition.endMinute) ?? 0;
	if (
		!(isValidHalfHourMinute(startMinute) && isValidHalfHourMinute(endMinute))
	) {
		return null;
	}
	if (endHour === 24 && endMinute !== 0) {
		return null;
	}

	const dayList = asNumberArray(condition.daysOfWeek);
	const daysOfWeek = dayList
		? new Set(dayList.map((day) => clampInt(Math.trunc(day), 0, 6)))
		: null;

	return {
		startHour,
		startMinute,
		endHour,
		endMinute,
		daysOfWeek,
	};
};

const computeTimeWindowIntersectionMinutes = (params: {
	startsAt: Date;
	endsAt: Date;
	timeZone: string;
	window: TimeWindowCondition;
}): number => {
	const startMs = params.startsAt.getTime();
	const endMs = params.endsAt.getTime();
	if (endMs <= startMs) {
		return 0;
	}

	let cursor = startMs;
	let intersectedMs = 0;
	while (cursor < endMs) {
		const next = Math.min(cursor + MINUTE_MS, endMs);
		const local = getLocalParts(new Date(cursor), params.timeZone);
		const minuteOfDay = local.hour * 60 + local.minute;
		const matchesDay =
			!params.window.daysOfWeek || params.window.daysOfWeek.has(local.weekday);
		if (
			matchesDay &&
			isMinuteInWindow({
				minuteOfDay,
				startHour: params.window.startHour,
				startMinute: params.window.startMinute,
				endHour: params.window.endHour,
				endMinute: params.window.endMinute,
			})
		) {
			intersectedMs += next - cursor;
		}
		cursor = next;
	}

	return Math.max(0, Math.round(intersectedMs / MINUTE_MS));
};

const ruleMatches = (params: {
	rule: BoatPricingRule;
	condition: PricingRuleCondition;
	estimatedHours: number;
	passengers: number;
	startsAt: Date;
	endsAt: Date;
	timeZone: string;
}) => {
	switch (params.rule.ruleType) {
		case "duration_discount": {
			const minHours = asNumber(params.condition.minHours);
			const maxHours = asNumber(params.condition.maxHours);
			if (minHours !== undefined && params.estimatedHours < minHours) {
				return false;
			}
			if (maxHours !== undefined && params.estimatedHours > maxHours) {
				return false;
			}
			return true;
		}

		case "passenger_surcharge": {
			const includedPassengers =
				asNumber(params.condition.includedPassengers) ?? 1;
			return params.passengers > includedPassengers;
		}

		case "time_window": {
			const window = parseTimeWindowCondition(params.condition);
			if (!window) {
				return false;
			}

			return (
				computeTimeWindowIntersectionMinutes({
					startsAt: params.startsAt,
					endsAt: params.endsAt,
					timeZone: params.timeZone,
					window,
				}) > 0
			);
		}

		case "weekend_surcharge": {
			const weekendDays = asNumberArray(params.condition.weekendDays) ?? [0, 6];
			const weekdaySet = new Set(weekendDays.map((day) => clampInt(day, 0, 6)));
			return rangeTouchesWeekday({
				startsAt: params.startsAt,
				endsAt: params.endsAt,
				timeZone: params.timeZone,
				weekdaySet,
			});
		}

		case "holiday_surcharge": {
			// TODO: implement with an explicit holiday calendar per org/region.
			return false;
		}

		case "custom": {
			// Minimal baseline: `{"always": true}` or `{}`.
			const always = params.condition.always;
			if (always === true) {
				return true;
			}
			return Object.keys(params.condition).length === 0;
		}

		default:
			return false;
	}
};

const ruleDeltaCents = (params: {
	rule: BoatPricingRule;
	condition: PricingRuleCondition;
	basePriceCents: number;
	passengers: number;
	startsAt: Date;
	endsAt: Date;
	timeZone: string;
}) => {
	if (params.rule.ruleType === "passenger_surcharge") {
		const includedPassengers =
			asNumber(params.condition.includedPassengers) ?? 1;
		const extraPassengers = Math.max(0, params.passengers - includedPassengers);
		if (extraPassengers <= 0) {
			return 0;
		}

		if (params.rule.adjustmentType === "fixed_cents") {
			return params.rule.adjustmentValue * extraPassengers;
		}

		// Percentage passenger surcharge applies once when threshold is exceeded.
		return percentageDelta(params.basePriceCents, params.rule.adjustmentValue);
	}

	if (params.rule.ruleType === "time_window") {
		const window = parseTimeWindowCondition(params.condition);
		if (!window) {
			return 0;
		}

		const intersectionMinutes = computeTimeWindowIntersectionMinutes({
			startsAt: params.startsAt,
			endsAt: params.endsAt,
			timeZone: params.timeZone,
			window,
		});
		if (intersectionMinutes <= 0) {
			return 0;
		}

		const totalMinutes = Math.max(
			1,
			Math.round(
				(params.endsAt.getTime() - params.startsAt.getTime()) / MINUTE_MS
			)
		);
		const overlapRatio = Math.min(intersectionMinutes / totalMinutes, 1);

		if (params.rule.adjustmentType === "fixed_cents") {
			return Math.round(params.rule.adjustmentValue * overlapRatio);
		}

		return Math.round(
			(params.basePriceCents * params.rule.adjustmentValue * overlapRatio) / 100
		);
	}

	if (params.rule.adjustmentType === "fixed_cents") {
		return params.rule.adjustmentValue;
	}

	return percentageDelta(params.basePriceCents, params.rule.adjustmentValue);
};

export const applyBoatPricingRulesToSubtotalCents = (params: {
	subtotalCents: number;
	estimatedHours: number;
	passengers: number;
	startsAt: Date;
	endsAt: Date;
	timeZone: string;
	pricingRules: BoatPricingRule[];
}) => {
	const activeRules = params.pricingRules
		.filter((rule) => rule.isActive)
		.slice()
		.sort(
			(a, b) => b.priority - a.priority || a.id.localeCompare(b.id, "en-US")
		);

	let subtotal = Math.max(0, Math.trunc(params.subtotalCents));
	for (const rule of activeRules) {
		const condition = safeParseConditionJson(rule.conditionJson);
		if (
			!ruleMatches({
				rule,
				condition,
				estimatedHours: params.estimatedHours,
				passengers: params.passengers,
				startsAt: params.startsAt,
				endsAt: params.endsAt,
				timeZone: params.timeZone,
			})
		) {
			continue;
		}

		const delta = ruleDeltaCents({
			rule,
			condition,
			basePriceCents: subtotal,
			passengers: params.passengers,
			startsAt: params.startsAt,
			endsAt: params.endsAt,
			timeZone: params.timeZone,
		});
		subtotal = Math.max(0, subtotal + delta);
	}

	return subtotal;
};

export const estimateBookingHours = (params: {
	startsAt: Date;
	endsAt: Date;
	boatMinimumHours: number;
	profileMinimumHours: number;
}) => {
	const intervalMs = params.endsAt.getTime() - params.startsAt.getTime();
	// Round up to the nearest half-hour (0.5h granularity)
	const intervalHours = Math.ceil((intervalMs / 3_600_000) * 2) / 2;
	return Math.max(
		intervalHours,
		params.boatMinimumHours,
		params.profileMinimumHours
	);
};

export const estimateBookingSubtotalCentsFromProfile = (params: {
	startsAt: Date;
	endsAt: Date;
	boatMinimumHours: number;
	passengers: number;
	timeZone: string;
	profile: BoatPricingProfile;
	pricingRules?: BoatPricingRule[];
}) => {
	const estimatedHours = estimateBookingHours({
		startsAt: params.startsAt,
		endsAt: params.endsAt,
		boatMinimumHours: params.boatMinimumHours,
		profileMinimumHours: params.profile.minimumHours,
	});
	const baseSubtotalCents =
		estimatedHours * params.profile.baseHourlyPriceCents;
	const adjustedSubtotalCents =
		params.pricingRules && params.pricingRules.length > 0
			? applyBoatPricingRulesToSubtotalCents({
					subtotalCents: baseSubtotalCents,
					estimatedHours,
					passengers: params.passengers,
					startsAt: params.startsAt,
					endsAt: params.endsAt,
					timeZone: params.timeZone,
					pricingRules: params.pricingRules,
				})
			: baseSubtotalCents;

	return {
		estimatedHours,
		subtotalCents: adjustedSubtotalCents,
	};
};

export const buildBookingPricingQuote = (params: {
	profile: BoatPricingProfile;
	estimatedHours: number;
	subtotalCents: number;
}): BookingPricingQuote => {
	const subtotalCents = Math.max(0, Math.trunc(params.subtotalCents));
	const serviceFeePercentage = clampInt(
		params.profile.serviceFeePercentage,
		0,
		100
	);
	const affiliateFeePercentage = clampInt(
		params.profile.affiliateFeePercentage,
		0,
		100
	);
	const depositPercentage = clampInt(params.profile.depositPercentage, 0, 100);
	const acquiringFeePercentage = clampInt(
		params.profile.acquiringFeePercentage,
		0,
		100
	);
	const taxPercentage = clampInt(params.profile.taxPercentage, 0, 100);

	const estimatedServiceFeeCents = percentageAmount(
		subtotalCents,
		serviceFeePercentage
	);
	const estimatedAffiliateFeeCents = percentageAmount(
		subtotalCents,
		affiliateFeePercentage
	);
	const totalPlatformFeesCents =
		estimatedServiceFeeCents + estimatedAffiliateFeeCents;

	// Internal expenses (not included in customer total).
	const estimatedAcquiringFeeCents = percentageAmount(
		totalPlatformFeesCents,
		acquiringFeePercentage
	);
	const estimatedTaxCents = percentageAmount(
		totalPlatformFeesCents,
		taxPercentage
	);

	const estimatedTotalPriceCents = subtotalCents + totalPlatformFeesCents;
	const estimatedPayNowCents = Math.max(
		estimatedTotalPriceCents - subtotalCents,
		0
	);
	const estimatedPayLaterCents = Math.max(subtotalCents, 0);

	return {
		profileId: params.profile.id,
		currency: params.profile.currency.toUpperCase(),
		baseHourlyPriceCents: params.profile.baseHourlyPriceCents,
		estimatedHours: params.estimatedHours,
		estimatedBasePriceCents: subtotalCents,
		serviceFeePercentage,
		acquiringFeePercentage,
		taxPercentage,
		affiliateFeePercentage,
		depositPercentage,
		estimatedServiceFeeCents,
		estimatedAcquiringFeeCents,
		estimatedTaxCents,
		estimatedAffiliateFeeCents,
		estimatedTotalPriceCents,
		estimatedPayNowCents,
		estimatedPayLaterCents,
	};
};

export const estimateBookingPricingQuoteFromProfile = (params: {
	startsAt: Date;
	endsAt: Date;
	boatMinimumHours: number;
	passengers: number;
	timeZone: string;
	profile: BoatPricingProfile;
	pricingRules?: BoatPricingRule[];
}): BookingPricingQuote => {
	const { estimatedHours, subtotalCents } =
		estimateBookingSubtotalCentsFromProfile(params);
	return buildBookingPricingQuote({
		profile: params.profile,
		estimatedHours,
		subtotalCents,
	});
};
