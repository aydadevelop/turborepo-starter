import type { BoatPricingProfile, BoatPricingRule } from "./pricing";
import {
	buildBookingPricingQuote,
	estimateBookingSubtotalCentsFromProfile,
} from "./pricing";

export interface BusyInterval {
	startsAt: Date;
	endsAt: Date;
}

export interface FreeGap {
	startsAt: Date;
	endsAt: Date;
	durationMinutes: number;
}

export interface TimeSlot {
	startsAt: Date;
	endsAt: Date;
}

export interface SlotWithPricing extends TimeSlot {
	durationMinutes: number;
	estimatedHours: number;
	subtotalCents: number;
	totalPriceCents: number;
	payNowCents: number;
	payLaterCents: number;
	currency: string;
	discountLabel: string | null;
}

export interface BoatDayConfig {
	workingHoursStart: number;
	workingHoursEnd: number;
	timezone: string;
	minimumHours: number;
}

const MINUTE_MS = 60_000;

/**
 * Convert a boat's working hours (integers 0–24 in local timezone)
 * to UTC Date boundaries for a specific calendar date.
 */
export const resolveWorkingWindow = (params: {
	date: string;
	workingHoursStart: number;
	workingHoursEnd: number;
	timezone: string;
}): { dayStart: Date; dayEnd: Date } => {
	const { date, workingHoursStart, workingHoursEnd, timezone } = params;

	const toUtc = (hour: number, dayOffset = 0): Date => {
		const parts = date.split("-");
		const year = Number(parts[0]);
		const month = Number(parts[1]);
		const day = Number(parts[2]);
		const localDate = new Date(
			Date.UTC(year, month - 1, day + dayOffset, hour)
		);
		const utcStr = localDate.toLocaleString("en-US", { timeZone: "UTC" });
		const tzStr = localDate.toLocaleString("en-US", { timeZone: timezone });
		const utcMs = new Date(utcStr).getTime();
		const tzMs = new Date(tzStr).getTime();
		const offsetMs = tzMs - utcMs;
		return new Date(localDate.getTime() - offsetMs);
	};

	const crossesMidnight = workingHoursEnd <= workingHoursStart;
	const dayStart = toUtc(workingHoursStart);
	const dayEnd = crossesMidnight
		? toUtc(workingHoursEnd, 1)
		: toUtc(workingHoursEnd);

	return { dayStart, dayEnd };
};

const clipIntervalToWindow = (
	start: number,
	end: number,
	windowStart?: Date,
	windowEnd?: Date
): { start: number; end: number } | null => {
	let s = start;
	let e = end;
	if (windowStart) {
		if (e <= windowStart.getTime()) {
			return null;
		}
		s = Math.max(s, windowStart.getTime());
	}
	if (windowEnd) {
		if (s >= windowEnd.getTime()) {
			return null;
		}
		e = Math.min(e, windowEnd.getTime());
	}
	return { start: s, end: e };
};

const mergeOverlapping = (sorted: BusyInterval[]): BusyInterval[] => {
	const first = sorted[0];
	if (!first) {
		return [];
	}
	const merged: BusyInterval[] = [first];
	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged.at(-1);
		if (!(last && current)) {
			continue;
		}

		if (current.startsAt.getTime() <= last.endsAt.getTime()) {
			if (current.endsAt.getTime() > last.endsAt.getTime()) {
				last.endsAt = current.endsAt;
			}
		} else {
			merged.push(current);
		}
	}
	return merged;
};

/**
 * Merge an array of busy intervals into a sorted, non-overlapping list.
 * Optionally clip to a window, expand by buffer minutes on each side.
 */
export const mergeBusyIntervals = (
	intervals: BusyInterval[],
	windowStart?: Date,
	windowEnd?: Date,
	bufferMinutes = 0
): BusyInterval[] => {
	if (intervals.length === 0) {
		return [];
	}

	const bufferMs = bufferMinutes * MINUTE_MS;

	const processed: BusyInterval[] = [];
	for (const iv of intervals) {
		const clipped = clipIntervalToWindow(
			iv.startsAt.getTime() - bufferMs,
			iv.endsAt.getTime() + bufferMs,
			windowStart,
			windowEnd
		);
		if (clipped) {
			processed.push({
				startsAt: new Date(clipped.start),
				endsAt: new Date(clipped.end),
			});
		}
	}

	if (processed.length === 0) {
		return [];
	}

	processed.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	return mergeOverlapping(processed);
};

/**
 * Given a time window and sorted merged busy intervals,
 * compute the free gaps between them.
 */
export const computeFreeGaps = (
	dayStart: Date,
	dayEnd: Date,
	busyIntervals: BusyInterval[]
): FreeGap[] => {
	const gaps: FreeGap[] = [];
	let cursor = dayStart.getTime();
	const end = dayEnd.getTime();

	for (const busy of busyIntervals) {
		const busyStart = busy.startsAt.getTime();
		const busyEnd = busy.endsAt.getTime();

		if (busyStart > cursor) {
			const durationMs = busyStart - cursor;
			gaps.push({
				startsAt: new Date(cursor),
				endsAt: new Date(busyStart),
				durationMinutes: durationMs / MINUTE_MS,
			});
		}

		cursor = Math.max(cursor, busyEnd);
	}

	// Trailing gap after last busy interval
	if (cursor < end) {
		const durationMs = end - cursor;
		gaps.push({
			startsAt: new Date(cursor),
			endsAt: new Date(end),
			durationMinutes: durationMs / MINUTE_MS,
		});
	}

	return gaps;
};

/**
 * From free gaps, extract bookable time slots of a given duration,
 * stepping by stepMinutes (default 30).
 */
export const extractSlotsFromGaps = (
	gaps: FreeGap[],
	durationMinutes: number,
	stepMinutes = 30
): TimeSlot[] => {
	const durationMs = durationMinutes * MINUTE_MS;
	const stepMs = stepMinutes * MINUTE_MS;
	const slots: TimeSlot[] = [];

	for (const gap of gaps) {
		const gapEnd = gap.endsAt.getTime();
		let cursor = gap.startsAt.getTime();

		while (cursor + durationMs <= gapEnd) {
			slots.push({
				startsAt: new Date(cursor),
				endsAt: new Date(cursor + durationMs),
			});
			cursor += stepMs;
		}
	}

	return slots;
};

// ─── composition layer ──────────────────────────────────────────────────────

/**
 * Full pipeline: for a single boat on a single date, compute all available
 * time slots of the requested duration.
 */
export const computeBoatDaySlots = (params: {
	date: string;
	boat: BoatDayConfig;
	busyIntervals: BusyInterval[];
	durationMinutes: number;
	stepMinutes?: number;
	bufferMinutes?: number;
}): TimeSlot[] => {
	const { dayStart, dayEnd } = resolveWorkingWindow({
		date: params.date,
		workingHoursStart: params.boat.workingHoursStart,
		workingHoursEnd: params.boat.workingHoursEnd,
		timezone: params.boat.timezone,
	});

	const busy = mergeBusyIntervals(
		params.busyIntervals,
		dayStart,
		dayEnd,
		params.bufferMinutes
	);
	const gaps = computeFreeGaps(dayStart, dayEnd, busy);
	return extractSlotsFromGaps(gaps, params.durationMinutes, params.stepMinutes);
};

/**
 * Enrich raw time slots with pricing information from a profile + rules.
 * Each slot may get different pricing (e.g. time-of-day surcharges).
 */
export const enrichSlotsWithPricing = (params: {
	slots: TimeSlot[];
	boatMinimumHours: number;
	passengers: number;
	timezone: string;
	profile: BoatPricingProfile;
	pricingRules?: BoatPricingRule[];
}): SlotWithPricing[] =>
	params.slots.map((slot) => {
		const durationMs = slot.endsAt.getTime() - slot.startsAt.getTime();
		const durationMinutes = durationMs / MINUTE_MS;

		const { estimatedHours, subtotalCents } =
			estimateBookingSubtotalCentsFromProfile({
				startsAt: slot.startsAt,
				endsAt: slot.endsAt,
				boatMinimumHours: params.boatMinimumHours,
				passengers: params.passengers,
				timeZone: params.timezone,
				profile: params.profile,
				pricingRules: params.pricingRules,
			});

		const quote = buildBookingPricingQuote({
			profile: params.profile,
			estimatedHours,
			subtotalCents,
		});

		const baseSubtotal = estimatedHours * params.profile.baseHourlyPriceCents;
		const hasDiscount = subtotalCents !== baseSubtotal;
		const discountPercent = hasDiscount
			? Math.round(((subtotalCents - baseSubtotal) / baseSubtotal) * 100)
			: 0;

		return {
			startsAt: slot.startsAt,
			endsAt: slot.endsAt,
			durationMinutes,
			estimatedHours,
			subtotalCents,
			totalPriceCents: quote.estimatedTotalPriceCents,
			payNowCents: quote.estimatedPayNowCents,
			payLaterCents: quote.estimatedPayLaterCents,
			currency: quote.currency,
			discountLabel: hasDiscount ? `${discountPercent}%` : null,
		};
	});

/**
 * Filter out slots that start before `now + minimumNoticeMinutes`.
 */
export const filterSlotsAfterMinNotice = (
	slots: TimeSlot[],
	now: Date,
	minimumNoticeMinutes: number
): TimeSlot[] => {
	const cutoff = now.getTime() + minimumNoticeMinutes * MINUTE_MS;
	return slots.filter((slot) => slot.startsAt.getTime() >= cutoff);
};
