const MINUTE_MS = 60_000;

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

const clipIntervalToWindow = (
	start: number,
	end: number,
	windowStart?: Date,
	windowEnd?: Date,
): { start: number; end: number } | null => {
	let s = start;
	let e = end;
	if (windowStart) {
		if (e <= windowStart.getTime()) return null;
		s = Math.max(s, windowStart.getTime());
	}
	if (windowEnd) {
		if (s >= windowEnd.getTime()) return null;
		e = Math.min(e, windowEnd.getTime());
	}
	return { start: s, end: e };
};

const mergeOverlapping = (sorted: BusyInterval[]): BusyInterval[] => {
	const first = sorted[0];
	if (!first) return [];
	const merged: BusyInterval[] = [{ startsAt: first.startsAt, endsAt: first.endsAt }];
	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged.at(-1);
		if (!(last && current)) continue;
		if (current.startsAt.getTime() <= last.endsAt.getTime()) {
			if (current.endsAt.getTime() > last.endsAt.getTime()) {
				last.endsAt = current.endsAt;
			}
		} else {
			merged.push({ startsAt: current.startsAt, endsAt: current.endsAt });
		}
	}
	return merged;
};

/**
 * Merge raw busy intervals into a sorted, non-overlapping list.
 * Optionally clips to a window and expands each interval by bufferMinutes.
 */
export const mergeBusyIntervals = (
	intervals: BusyInterval[],
	windowStart?: Date,
	windowEnd?: Date,
	bufferMinutes = 0,
): BusyInterval[] => {
	if (intervals.length === 0) return [];

	const bufferMs = bufferMinutes * MINUTE_MS;
	const processed: BusyInterval[] = [];

	for (const iv of intervals) {
		const clipped = clipIntervalToWindow(
			iv.startsAt.getTime() - bufferMs,
			iv.endsAt.getTime() + bufferMs,
			windowStart,
			windowEnd,
		);
		if (clipped) {
			processed.push({
				startsAt: new Date(clipped.start),
				endsAt: new Date(clipped.end),
			});
		}
	}

	if (processed.length === 0) return [];

	processed.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	return mergeOverlapping(processed);
};

/**
 * Given a time window and sorted merged busy intervals, compute the free gaps
 * between them (and before/after the first/last busy interval).
 */
export const findFreeGaps = (
	dayStart: Date,
	dayEnd: Date,
	busyIntervals: BusyInterval[],
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
	stepMinutes = 30,
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

/**
 * Full pipeline: given a window [dayStart, dayEnd], busy intervals, and a
 * required slot duration, returns all available time slots that satisfy the
 * minimum duration requirement.
 */
export const calculateAvailableSlots = (params: {
	dayStart: Date;
	dayEnd: Date;
	busyIntervals: BusyInterval[];
	durationMinutes: number;
	stepMinutes?: number;
	bufferMinutes?: number;
	minimumDurationMinutes?: number;
}): TimeSlot[] => {
	const mergedBusy = mergeBusyIntervals(
		params.busyIntervals,
		params.dayStart,
		params.dayEnd,
		params.bufferMinutes,
	);
	const gaps = findFreeGaps(params.dayStart, params.dayEnd, mergedBusy);
	const minDuration = params.minimumDurationMinutes ?? params.durationMinutes;
	const qualifyingGaps = gaps.filter((g) => g.durationMinutes >= minDuration);
	return extractSlotsFromGaps(
		qualifyingGaps,
		params.durationMinutes,
		params.stepMinutes,
	);
};
