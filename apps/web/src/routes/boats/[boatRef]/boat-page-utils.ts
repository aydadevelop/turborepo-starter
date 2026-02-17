const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

const roundHalf = (value: number): number => Math.round(value * 2) / 2;

const normalizeDurationHours = (value: string | null, fallback = 2): number => {
	const parsed = Number.parseFloat(value ?? "");
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return clamp(roundHalf(parsed), 0.5, 24);
};

const toLocalIsoDate = (value: Date): string =>
	`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
		value.getDate()
	).padStart(2, "0")}`;

const toHourLabel = (value: number): string => `${value}`.padStart(2, "0");

const formatDurationLabel = (value: number): string =>
	Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;

const formatDateTimeInZone = (value: Date, timeZone: string): string =>
	new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone,
		timeZoneName: "short",
	}).format(value);

const formatDateTimeIsoUtc = (value: Date): string => value.toISOString();

const formatDateTimeUtc = (value: Date): string =>
	new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "UTC",
	}).format(value);

const formatMoneyRu = (cents: number, currency: string): string =>
	new Intl.NumberFormat("ru-RU", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(cents / 100);

const formatPricingDeltaLabel = (label: string | null): string => {
	if (!label) {
		return "—";
	}
	if (label.startsWith("+") || label.startsWith("-")) {
		return label;
	}
	return `+${label}`;
};

const formatBlockSourceLabel = (source: string): string =>
	source
		.split("_")
		.map((part) =>
			part.length > 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part
		)
		.join(" ");

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseJsonObject = (raw: string): Record<string, unknown> => {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch {
		return {};
	}
};

const asNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const asNumberArray = (value: unknown): number[] =>
	Array.isArray(value)
		? value.filter((item): item is number => typeof item === "number")
		: [];

const formatHourMinute = (
	hourValue: unknown,
	minuteValue: unknown,
	fallbackHour = 0
): string => {
	const hour = asNumber(hourValue);
	const minute = asNumber(minuteValue);
	const safeHour =
		hour !== null ? Math.max(0, Math.min(24, Math.trunc(hour))) : fallbackHour;
	const safeMinute =
		minute !== null ? Math.max(0, Math.min(59, Math.trunc(minute))) : 0;
	return `${toHourLabel(safeHour)}:${String(safeMinute).padStart(2, "0")}`;
};

type PublicPricingRule = {
	ruleType: string;
	conditionJson: string;
	adjustmentType: string;
	adjustmentValue: number;
	pricingProfileId: string | null;
};

const formatRuleCondition = (rule: PublicPricingRule): string => {
	const condition = parseJsonObject(rule.conditionJson);

	switch (rule.ruleType) {
		case "time_window": {
			const from = formatHourMinute(
				condition.startHour,
				condition.startMinute,
				0
			);
			const to = formatHourMinute(condition.endHour, condition.endMinute, 0);
			const days = asNumberArray(condition.daysOfWeek)
				.map((day) => weekdayLabels[Math.max(0, Math.min(6, Math.trunc(day)))])
				.join(", ");
			return days.length > 0
				? `${from} -> ${to} (${days})`
				: `${from} -> ${to}`;
		}
		case "duration_discount": {
			const minHours = asNumber(condition.minHours);
			const maxHours = asNumber(condition.maxHours);
			if (minHours !== null && maxHours !== null) {
				return `${minHours}h-${maxHours}h`;
			}
			if (minHours !== null) {
				return `>= ${minHours}h`;
			}
			if (maxHours !== null) {
				return `<= ${maxHours}h`;
			}
			return "Any duration";
		}
		case "passenger_surcharge": {
			const includedPassengers = asNumber(condition.includedPassengers);
			return includedPassengers !== null
				? `Above ${Math.trunc(includedPassengers)} passengers`
				: "Passenger threshold";
		}
		case "weekend_surcharge": {
			const weekendDays = asNumberArray(condition.weekendDays);
			if (weekendDays.length === 0) {
				return "Weekend";
			}
			return weekendDays
				.map((day) => weekdayLabels[Math.max(0, Math.min(6, Math.trunc(day)))])
				.join(", ");
		}
		case "holiday_surcharge":
			return "Holiday calendar";
		case "custom":
			return Object.keys(condition).length > 0
				? JSON.stringify(condition)
				: "Custom condition";
		default:
			return Object.keys(condition).length > 0
				? JSON.stringify(condition)
				: "n/a";
	}
};

const formatRuleAdjustment = (
	rule: Pick<PublicPricingRule, "adjustmentType" | "adjustmentValue">,
	currency: string
): string => {
	let sign = "";
	if (rule.adjustmentValue > 0) {
		sign = "+";
	} else if (rule.adjustmentValue < 0) {
		sign = "-";
	}
	const absValue = Math.abs(rule.adjustmentValue);
	if (rule.adjustmentType === "percentage") {
		return `${sign}${absValue}%`;
	}
	return `${sign}${formatMoneyRu(absValue, currency)}`;
};

const toSlotKey = (startsAt: Date, endsAt: Date): string =>
	`${startsAt.toISOString()}-${endsAt.toISOString()}`;

const areDurationsEqual = (left: number, right: number): boolean =>
	Math.abs(left - right) < 0.001;

const normalizeDurationOptions = (values: number[]): number[] => {
	const fromApi = values
		.map((value) => clamp(roundHalf(value), 0.5, 24))
		.filter((value) => Number.isFinite(value));
	const merged = fromApi.length > 0 ? fromApi : [1, 1.5, 2, 3, 4];
	return Array.from(new Set(merged)).sort((a, b) => a - b);
};

const buildIdempotencyKey = (): string =>
	`mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type BookableSlot = {
	startsAt: Date;
	endsAt: Date;
};

export type { BookableSlot, PublicPricingRule };
export {
	clamp,
	normalizeDurationHours,
	toLocalIsoDate,
	toHourLabel,
	formatDurationLabel,
	formatDateTimeInZone,
	formatDateTimeIsoUtc,
	formatDateTimeUtc,
	formatMoneyRu,
	formatPricingDeltaLabel,
	formatBlockSourceLabel,
	weekdayLabels,
	formatHourMinute,
	formatRuleCondition,
	formatRuleAdjustment,
	toSlotKey,
	areDurationsEqual,
	normalizeDurationOptions,
	buildIdempotencyKey,
};
