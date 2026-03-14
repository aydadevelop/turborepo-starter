import type { PublicBookingSlotStatus } from "../types";

export const MINUTE_MS = 60_000;
export const SLOT_STEP_MINUTES = 30;
const GMT_OFFSET_RE = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/;

export interface MinuteWindow {
	endMinute: number;
	startMinute: number;
}

export interface BusyWindow {
	endsAt: Date;
	reason: string | null;
	source: "booking" | "manual" | "calendar" | "maintenance" | "system";
	startsAt: Date;
}

export interface AvailabilityRuleWindow {
	endMinute: number;
	startMinute: number;
}

export interface AvailabilityExceptionWindow {
	endMinute: number | null;
	isAvailable: boolean;
	startMinute: number | null;
}

export interface MinimumDurationRuleWindow {
	daysOfWeek: number[] | null;
	endHour: number;
	endMinute: number;
	minimumDurationMinutes: number;
	startHour: number;
	startMinute: number;
}

export const parseDateString = (date: string): Date => {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
};

export const nextDateString = (date: string): string => {
	const value = parseDateString(date);
	value.setUTCDate(value.getUTCDate() + 1);
	return value.toISOString().slice(0, 10);
};

export const getWeekdayForDateString = (date: string): number => {
	const value = parseDateString(date);
	return value.getUTCDay();
};

const getOffsetFormatter = (timeZone: string): Intl.DateTimeFormat =>
	new Intl.DateTimeFormat("en-US", {
		timeZone,
		timeZoneName: "shortOffset",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

const getTimeFormatter = (timeZone: string): Intl.DateTimeFormat =>
	new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

export const getTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
	const parts = getOffsetFormatter(timeZone).formatToParts(date);
	const rawOffset =
		parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
	const match = GMT_OFFSET_RE.exec(rawOffset);
	if (!match) {
		return 0;
	}

	const sign = match[1] === "-" ? -1 : 1;
	const hours = Number(match[2] ?? "0");
	const minutes = Number(match[3] ?? "0");
	return sign * (hours * 60 + minutes) * MINUTE_MS;
};

export const zonedLocalDateTimeToUtc = (
	date: string,
	minuteOfDay: number,
	timeZone: string
): Date => {
	const [year, month, day] = date.split("-").map(Number);
	const hours = Math.floor(minuteOfDay / 60);
	const minutes = minuteOfDay % 60;
	const utcGuess = new Date(
		Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hours, minutes, 0, 0)
	);
	const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
	return new Date(utcGuess.getTime() - offset);
};

export const formatTimeInZone = (date: Date, timeZone: string): string =>
	getTimeFormatter(timeZone).format(date);

export const mergeMinuteWindows = (windows: MinuteWindow[]): MinuteWindow[] => {
	const sorted = [...windows].sort(
		(left, right) => left.startMinute - right.startMinute
	);
	if (!sorted.length) {
		return [];
	}

	const [firstWindow] = sorted;
	if (!firstWindow) {
		return [];
	}

	const merged: MinuteWindow[] = [firstWindow];
	for (const window of sorted.slice(1)) {
		const current = merged.at(-1);
		if (!current) {
			merged.push({ ...window });
			continue;
		}
		if (window.startMinute <= current.endMinute) {
			current.endMinute = Math.max(current.endMinute, window.endMinute);
			continue;
		}
		merged.push({ ...window });
	}

	return merged;
};

export const subtractMinuteWindow = (
	windows: MinuteWindow[],
	windowToRemove: MinuteWindow
): MinuteWindow[] => {
	const next: MinuteWindow[] = [];

	for (const window of windows) {
		if (
			windowToRemove.endMinute <= window.startMinute ||
			windowToRemove.startMinute >= window.endMinute
		) {
			next.push(window);
			continue;
		}

		if (windowToRemove.startMinute > window.startMinute) {
			next.push({
				startMinute: window.startMinute,
				endMinute: windowToRemove.startMinute,
			});
		}

		if (windowToRemove.endMinute < window.endMinute) {
			next.push({
				startMinute: windowToRemove.endMinute,
				endMinute: window.endMinute,
			});
		}
	}

	return next;
};

export const resolveAvailabilityWindows = (params: {
	workingHoursStart: number;
	workingHoursEnd: number;
	exception: AvailabilityExceptionWindow | undefined;
	rules: AvailabilityRuleWindow[];
}): MinuteWindow[] => {
	const recurringWindows =
		params.rules.length > 0
			? mergeMinuteWindows(
					params.rules.map((rule) => ({
						startMinute: rule.startMinute,
						endMinute: rule.endMinute,
					}))
				)
			: [
					{
						startMinute: params.workingHoursStart * 60,
						endMinute: params.workingHoursEnd * 60,
					},
				];

	if (!params.exception) {
		return recurringWindows;
	}

	if (params.exception.isAvailable) {
		if (
			params.exception.startMinute === null ||
			params.exception.endMinute === null
		) {
			return recurringWindows;
		}

		return mergeMinuteWindows([
			...recurringWindows,
			{
				startMinute: params.exception.startMinute,
				endMinute: params.exception.endMinute,
			},
		]);
	}

	if (
		params.exception.startMinute === null ||
		params.exception.endMinute === null
	) {
		return [];
	}

	return subtractMinuteWindow(recurringWindows, {
		startMinute: params.exception.startMinute,
		endMinute: params.exception.endMinute,
	});
};

export const resolveRequiredMinimumDuration = (params: {
	baseMinimumDurationMinutes: number;
	dayOfWeek: number;
	slotMinuteOfDay: number;
	rules: MinimumDurationRuleWindow[];
}): number => {
	let required = params.baseMinimumDurationMinutes;

	for (const rule of params.rules) {
		if (rule.daysOfWeek && !rule.daysOfWeek.includes(params.dayOfWeek)) {
			continue;
		}

		const ruleStartMinute = rule.startHour * 60 + rule.startMinute;
		const ruleEndMinute = rule.endHour * 60 + rule.endMinute;
		if (
			params.slotMinuteOfDay >= ruleStartMinute &&
			params.slotMinuteOfDay < ruleEndMinute
		) {
			required = Math.max(required, rule.minimumDurationMinutes);
		}
	}

	return required;
};

export const findBusyWindow = (
	busyWindows: BusyWindow[],
	startsAt: Date,
	endsAt: Date
): BusyWindow | null =>
	busyWindows.find(
		(window) => window.startsAt < endsAt && window.endsAt > startsAt
	) ?? null;

export const toSlotStatusLabel = (status: PublicBookingSlotStatus): string => {
	switch (status) {
		case "available":
			return "Available";
		case "blocked":
			return "Blocked";
		case "notice_too_short":
			return "Notice too short";
		case "minimum_duration_not_met":
			return "Longer duration required";
		default:
			return status;
	}
};
