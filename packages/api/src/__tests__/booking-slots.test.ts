import { describe, expect, it } from "vitest";

import type { BoatPricingProfile, BoatPricingRule } from "../booking/pricing";
import {
	type BoatDayConfig,
	type BusyInterval,
	computeBoatDaySlots,
	computeFreeGaps,
	enrichSlotsWithPricing,
	extractSlotsFromGaps,
	type FreeGap,
	filterSlotsAfterMinNotice,
	mergeBusyIntervals,
	resolveWorkingWindow,
} from "../booking/slots";

// ─── helpers ────────────────────────────────────────────────────────────────

const nth = <T>(arr: readonly T[], index: number): T => {
	const item = arr[index];
	if (item === undefined) {
		throw new Error(`Expected element at index ${index}`);
	}
	return item;
};

const utc = (iso: string) => new Date(iso);

const interval = (start: string, end: string): BusyInterval => ({
	startsAt: utc(start),
	endsAt: utc(end),
});

const makeProfile = (
	overrides: Partial<BoatPricingProfile> = {}
): BoatPricingProfile => {
	const now = new Date("2026-02-10T00:00:00.000Z");
	return {
		id: "profile-1",
		boatId: "boat-1",
		name: "Default",
		currency: "RUB",
		baseHourlyPriceCents: 10_000,
		minimumHours: 1,
		depositPercentage: 0,
		serviceFeePercentage: 10,
		affiliateFeePercentage: 5,
		taxPercentage: 20,
		acquiringFeePercentage: 3,
		validFrom: now,
		validTo: null,
		isDefault: true,
		createdByUserId: null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
};

const makeRule = (
	overrides: Partial<BoatPricingRule> = {}
): BoatPricingRule => {
	const now = new Date("2026-02-10T00:00:00.000Z");
	return {
		id: "rule-1",
		boatId: "boat-1",
		pricingProfileId: null,
		name: "Rule",
		ruleType: "custom",
		conditionJson: "{}",
		adjustmentType: "fixed_cents",
		adjustmentValue: 0,
		priority: 0,
		isActive: true,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
};

const moscowBoat: BoatDayConfig = {
	workingHoursStart: 9,
	workingHoursEnd: 21,
	timezone: "Europe/Moscow",
	minimumHours: 1,
};

const utcBoat: BoatDayConfig = {
	workingHoursStart: 9,
	workingHoursEnd: 21,
	timezone: "UTC",
	minimumHours: 2,
};

const nightBoat: BoatDayConfig = {
	workingHoursStart: 18,
	workingHoursEnd: 2,
	timezone: "UTC",
	minimumHours: 1,
};

// ─── resolveWorkingWindow ───────────────────────────────────────────────────

describe("resolveWorkingWindow", () => {
	it("converts working hours to UTC timestamps for a given date", () => {
		// Boat in UTC, working 9–21, on 2026-03-10
		const result = resolveWorkingWindow({
			date: "2026-03-10",
			workingHoursStart: 9,
			workingHoursEnd: 21,
			timezone: "UTC",
		});

		expect(result.dayStart).toEqual(utc("2026-03-10T09:00:00.000Z"));
		expect(result.dayEnd).toEqual(utc("2026-03-10T21:00:00.000Z"));
	});

	it("handles timezone offset correctly", () => {
		// Boat in Moscow (UTC+3), working 9–21
		// 9:00 Moscow = 6:00 UTC, 21:00 Moscow = 18:00 UTC
		const result = resolveWorkingWindow({
			date: "2026-03-10",
			workingHoursStart: 9,
			workingHoursEnd: 21,
			timezone: "Europe/Moscow",
		});

		expect(result.dayStart).toEqual(utc("2026-03-10T06:00:00.000Z"));
		expect(result.dayEnd).toEqual(utc("2026-03-10T18:00:00.000Z"));
	});

	it("handles cross-midnight working hours", () => {
		// Boat works 18–02 (nightlife), UTC
		const result = resolveWorkingWindow({
			date: "2026-03-10",
			workingHoursStart: 18,
			workingHoursEnd: 2,
			timezone: "UTC",
		});

		expect(result.dayStart).toEqual(utc("2026-03-10T18:00:00.000Z"));
		expect(result.dayEnd).toEqual(utc("2026-03-11T02:00:00.000Z"));
	});
});

// ─── mergeBusyIntervals ─────────────────────────────────────────────────────

describe("mergeBusyIntervals", () => {
	it("returns empty array when no intervals", () => {
		expect(mergeBusyIntervals([])).toEqual([]);
	});

	it("passes through a single interval", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T12:00:00Z"));
	});

	it("merges overlapping intervals", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T11:00:00Z", "2026-03-10T13:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T13:00:00Z"));
	});

	it("merges adjacent intervals (touching boundaries)", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T12:00:00Z", "2026-03-10T14:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T14:00:00Z"));
	});

	it("keeps non-overlapping intervals separate", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z"),
			interval("2026-03-10T14:00:00Z", "2026-03-10T16:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals);

		expect(result).toHaveLength(2);
	});

	it("handles unsorted input", () => {
		const intervals = [
			interval("2026-03-10T14:00:00Z", "2026-03-10T16:00:00Z"),
			interval("2026-03-10T09:00:00Z", "2026-03-10T11:00:00Z"),
			interval("2026-03-10T10:30:00Z", "2026-03-10T12:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals);

		expect(result).toHaveLength(2);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T09:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T12:00:00Z"));
		expect(nth(result, 1).startsAt).toEqual(utc("2026-03-10T14:00:00Z"));
		expect(nth(result, 1).endsAt).toEqual(utc("2026-03-10T16:00:00Z"));
	});

	it("merges multiple overlapping intervals into one", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T11:00:00Z", "2026-03-10T13:00:00Z"),
			interval("2026-03-10T12:30:00Z", "2026-03-10T15:00:00Z"),
			interval("2026-03-10T14:00:00Z", "2026-03-10T16:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T16:00:00Z"));
	});

	it("clips intervals to the provided window", () => {
		const windowStart = utc("2026-03-10T09:00:00Z");
		const windowEnd = utc("2026-03-10T21:00:00Z");
		const intervals = [
			interval("2026-03-10T07:00:00Z", "2026-03-10T10:00:00Z"), // starts before window
			interval("2026-03-10T20:00:00Z", "2026-03-10T23:00:00Z"), // ends after window
		];
		const result = mergeBusyIntervals(intervals, windowStart, windowEnd);

		expect(result).toHaveLength(2);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T09:00:00Z")); // clipped to window start
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(result, 1).startsAt).toEqual(utc("2026-03-10T20:00:00Z"));
		expect(nth(result, 1).endsAt).toEqual(utc("2026-03-10T21:00:00Z")); // clipped to window end
	});

	it("discards intervals entirely outside the window", () => {
		const windowStart = utc("2026-03-10T09:00:00Z");
		const windowEnd = utc("2026-03-10T21:00:00Z");
		const intervals = [
			interval("2026-03-10T05:00:00Z", "2026-03-10T08:00:00Z"), // before window
			interval("2026-03-10T22:00:00Z", "2026-03-10T23:00:00Z"), // after window
			interval("2026-03-10T12:00:00Z", "2026-03-10T14:00:00Z"), // inside
		];
		const result = mergeBusyIntervals(intervals, windowStart, windowEnd);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T12:00:00Z"));
	});

	it("applies buffer minutes to expand intervals", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T15:00:00Z", "2026-03-10T16:00:00Z"),
		];
		const result = mergeBusyIntervals(intervals, undefined, undefined, 30);

		expect(result).toHaveLength(2);
		// Each interval expanded by 30min on each side
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T09:30:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T12:30:00Z"));
		expect(nth(result, 1).startsAt).toEqual(utc("2026-03-10T14:30:00Z"));
		expect(nth(result, 1).endsAt).toEqual(utc("2026-03-10T16:30:00Z"));
	});

	it("merges intervals that overlap after buffer expansion", () => {
		const intervals = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T12:30:00Z", "2026-03-10T14:00:00Z"), // 30min gap -> merged with 30min buffer
		];
		const result = mergeBusyIntervals(intervals, undefined, undefined, 30);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T09:30:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T14:30:00Z"));
	});
});

// ─── computeFreeGaps ────────────────────────────────────────────────────────

describe("computeFreeGaps", () => {
	const dayStart = utc("2026-03-10T09:00:00Z");
	const dayEnd = utc("2026-03-10T21:00:00Z");

	it("returns full window when no busy intervals", () => {
		const result = computeFreeGaps(dayStart, dayEnd, []);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(dayStart);
		expect(nth(result, 0).endsAt).toEqual(dayEnd);
		expect(nth(result, 0).durationMinutes).toBe(720);
	});

	it("computes gaps around a single busy interval", () => {
		const busy = [interval("2026-03-10T12:00:00Z", "2026-03-10T14:00:00Z")];
		const result = computeFreeGaps(dayStart, dayEnd, busy);

		expect(result).toHaveLength(2);
		expect(nth(result, 0).startsAt).toEqual(dayStart);
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T12:00:00Z"));
		expect(nth(result, 0).durationMinutes).toBe(180);
		expect(nth(result, 1).startsAt).toEqual(utc("2026-03-10T14:00:00Z"));
		expect(nth(result, 1).endsAt).toEqual(dayEnd);
		expect(nth(result, 1).durationMinutes).toBe(420);
	});

	it("handles busy interval at start of window", () => {
		const busy = [interval("2026-03-10T09:00:00Z", "2026-03-10T11:00:00Z")];
		const result = computeFreeGaps(dayStart, dayEnd, busy);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T11:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(dayEnd);
	});

	it("handles busy interval at end of window", () => {
		const busy = [interval("2026-03-10T19:00:00Z", "2026-03-10T21:00:00Z")];
		const result = computeFreeGaps(dayStart, dayEnd, busy);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(dayStart);
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T19:00:00Z"));
	});

	it("returns empty when fully booked", () => {
		const busy = [interval("2026-03-10T09:00:00Z", "2026-03-10T21:00:00Z")];
		const result = computeFreeGaps(dayStart, dayEnd, busy);

		expect(result).toHaveLength(0);
	});

	it("handles multiple busy intervals with gaps between", () => {
		const busy = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T11:00:00Z"),
			interval("2026-03-10T13:00:00Z", "2026-03-10T15:00:00Z"),
			interval("2026-03-10T18:00:00Z", "2026-03-10T20:00:00Z"),
		];
		const result = computeFreeGaps(dayStart, dayEnd, busy);

		expect(result).toHaveLength(4);
		// 09:00-10:00 (60min)
		expect(nth(result, 0).durationMinutes).toBe(60);
		// 11:00-13:00 (120min)
		expect(nth(result, 1).durationMinutes).toBe(120);
		// 15:00-18:00 (180min)
		expect(nth(result, 2).durationMinutes).toBe(180);
		// 20:00-21:00 (60min)
		expect(nth(result, 3).durationMinutes).toBe(60);
	});

	it("returns empty when busy intervals cover entire window", () => {
		const busy = [
			interval("2026-03-10T09:00:00Z", "2026-03-10T15:00:00Z"),
			interval("2026-03-10T15:00:00Z", "2026-03-10T21:00:00Z"),
		];
		const result = computeFreeGaps(dayStart, dayEnd, busy);

		expect(result).toHaveLength(0);
	});
});

// ─── extractSlotsFromGaps ───────────────────────────────────────────────────

describe("extractSlotsFromGaps", () => {
	it("returns empty when no gaps", () => {
		const result = extractSlotsFromGaps([], 120);
		expect(result).toHaveLength(0);
	});

	it("returns empty when gap is shorter than duration", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T09:00:00Z"),
				endsAt: utc("2026-03-10T10:00:00Z"),
				durationMinutes: 60,
			},
		];
		const result = extractSlotsFromGaps(gaps, 120);
		expect(result).toHaveLength(0);
	});

	it("extracts exactly one slot when gap equals duration", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T12:00:00Z"),
				endsAt: utc("2026-03-10T14:00:00Z"),
				durationMinutes: 120,
			},
		];
		const result = extractSlotsFromGaps(gaps, 120);

		expect(result).toHaveLength(1);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T12:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T14:00:00Z"));
	});

	it("extracts multiple 30-min-step slots from a larger gap", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T09:00:00Z"),
				endsAt: utc("2026-03-10T12:00:00Z"),
				durationMinutes: 180,
			},
		];
		// 2-hour slots, 30-min step, in a 3-hour gap:
		// 09:00-11:00, 09:30-11:30, 10:00-12:00 = 3 slots
		const result = extractSlotsFromGaps(gaps, 120);

		expect(result).toHaveLength(3);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T09:00:00Z"));
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T11:00:00Z"));
		expect(nth(result, 1).startsAt).toEqual(utc("2026-03-10T09:30:00Z"));
		expect(nth(result, 1).endsAt).toEqual(utc("2026-03-10T11:30:00Z"));
		expect(nth(result, 2).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(result, 2).endsAt).toEqual(utc("2026-03-10T12:00:00Z"));
	});

	it("uses custom step size", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T09:00:00Z"),
				endsAt: utc("2026-03-10T12:00:00Z"),
				durationMinutes: 180,
			},
		];
		// 2-hour slots, 60-min step:
		// 09:00-11:00, 10:00-12:00 = 2 slots
		const result = extractSlotsFromGaps(gaps, 120, 60);

		expect(result).toHaveLength(2);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T09:00:00Z"));
		expect(nth(result, 1).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
	});

	it("extracts slots from multiple gaps", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T09:00:00Z"),
				endsAt: utc("2026-03-10T10:00:00Z"),
				durationMinutes: 60,
			},
			{
				startsAt: utc("2026-03-10T14:00:00Z"),
				endsAt: utc("2026-03-10T17:00:00Z"),
				durationMinutes: 180,
			},
		];
		// 2-hour slots: first gap too small, second gap yields 3 slots
		const result = extractSlotsFromGaps(gaps, 120);

		expect(result).toHaveLength(3);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-03-10T14:00:00Z"));
	});

	it("extracts 3-hour slots correctly", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T09:00:00Z"),
				endsAt: utc("2026-03-10T15:00:00Z"),
				durationMinutes: 360,
			},
		];
		// 3-hour slots, 30-min step, 6-hour gap:
		// 09:00-12:00, 09:30-12:30, 10:00-13:00, 10:30-13:30,
		// 11:00-14:00, 11:30-14:30, 12:00-15:00 = 7 slots
		const result = extractSlotsFromGaps(gaps, 180);

		expect(result).toHaveLength(7);
		expect(nth(result, 0).endsAt).toEqual(utc("2026-03-10T12:00:00Z"));
		expect(nth(result, 6).startsAt).toEqual(utc("2026-03-10T12:00:00Z"));
		expect(nth(result, 6).endsAt).toEqual(utc("2026-03-10T15:00:00Z"));
	});

	it("handles 1-hour slots in a tight gap", () => {
		const gaps: FreeGap[] = [
			{
				startsAt: utc("2026-03-10T11:00:00Z"),
				endsAt: utc("2026-03-10T12:30:00Z"),
				durationMinutes: 90,
			},
		];
		// 1-hour slots, 30-min step:
		// 11:00-12:00, 11:30-12:30 = 2 slots
		const result = extractSlotsFromGaps(gaps, 60);

		expect(result).toHaveLength(2);
	});
});

// ─── integration: full pipeline ─────────────────────────────────────────────

describe("full pipeline: merge → gaps → slots", () => {
	it("computes available 2-hour slots for a partially booked day", () => {
		const dayStart = utc("2026-03-10T09:00:00Z");
		const dayEnd = utc("2026-03-10T21:00:00Z");

		const bookings: BusyInterval[] = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T14:00:00Z", "2026-03-10T15:30:00Z"),
		];
		const blocks: BusyInterval[] = [
			interval("2026-03-10T16:00:00Z", "2026-03-10T17:00:00Z"),
		];

		const busy = mergeBusyIntervals([...bookings, ...blocks], dayStart, dayEnd);
		const gaps = computeFreeGaps(dayStart, dayEnd, busy);
		const slots = extractSlotsFromGaps(gaps, 120); // 2-hour slots

		// Free gaps: 09-10 (60min), 12-14 (120min), 15:30-16:00 (30min), 17-21 (240min)
		// 2h slots from 60min gap: 0
		// 2h slots from 120min gap: 1 (12:00-14:00)
		// 2h slots from 30min gap: 0
		// 2h slots from 240min gap: 5 (17-19, 17:30-19:30, 18-20, 18:30-20:30, 19-21)
		expect(slots).toHaveLength(6);
		expect(nth(slots, 0).startsAt).toEqual(utc("2026-03-10T12:00:00Z"));
		expect(nth(slots, 0).endsAt).toEqual(utc("2026-03-10T14:00:00Z"));
		expect(nth(slots, 1).startsAt).toEqual(utc("2026-03-10T17:00:00Z"));
	});

	it("returns zero slots for a fully booked day", () => {
		const dayStart = utc("2026-03-10T09:00:00Z");
		const dayEnd = utc("2026-03-10T21:00:00Z");

		const bookings: BusyInterval[] = [
			interval("2026-03-10T09:00:00Z", "2026-03-10T21:00:00Z"),
		];

		const busy = mergeBusyIntervals(bookings, dayStart, dayEnd);
		const gaps = computeFreeGaps(dayStart, dayEnd, busy);
		const slots = extractSlotsFromGaps(gaps, 120);

		expect(slots).toHaveLength(0);
	});

	it("returns full slots for a completely free day", () => {
		const dayStart = utc("2026-03-10T09:00:00Z");
		const dayEnd = utc("2026-03-10T21:00:00Z");

		const busy = mergeBusyIntervals([], dayStart, dayEnd);
		const gaps = computeFreeGaps(dayStart, dayEnd, busy);
		const slots = extractSlotsFromGaps(gaps, 120); // 2-hour slots

		// 12-hour window, 2h slots, 30min step: (720 - 120) / 30 + 1 = 21
		expect(slots).toHaveLength(21);
		expect(nth(slots, 0).startsAt).toEqual(utc("2026-03-10T09:00:00Z"));
		expect(nth(slots, 0).endsAt).toEqual(utc("2026-03-10T11:00:00Z"));
		expect(nth(slots, 20).startsAt).toEqual(utc("2026-03-10T19:00:00Z"));
		expect(nth(slots, 20).endsAt).toEqual(utc("2026-03-10T21:00:00Z"));
	});

	it("handles overlapping bookings and blocks correctly", () => {
		const dayStart = utc("2026-03-10T09:00:00Z");
		const dayEnd = utc("2026-03-10T21:00:00Z");

		// Booking 10-12, block 11-13 → merged: 10-13
		const intervals: BusyInterval[] = [
			interval("2026-03-10T10:00:00Z", "2026-03-10T12:00:00Z"),
			interval("2026-03-10T11:00:00Z", "2026-03-10T13:00:00Z"),
		];

		const busy = mergeBusyIntervals(intervals, dayStart, dayEnd);
		expect(busy).toHaveLength(1);
		expect(nth(busy, 0).startsAt).toEqual(utc("2026-03-10T10:00:00Z"));
		expect(nth(busy, 0).endsAt).toEqual(utc("2026-03-10T13:00:00Z"));

		const gaps = computeFreeGaps(dayStart, dayEnd, busy);
		// 09-10 (60min), 13-21 (480min)
		expect(gaps).toHaveLength(2);
	});

	it("applies buffer between bookings", () => {
		const dayStart = utc("2026-03-10T09:00:00Z");
		const dayEnd = utc("2026-03-10T21:00:00Z");

		const bookings: BusyInterval[] = [
			interval("2026-03-10T12:00:00Z", "2026-03-10T14:00:00Z"),
		];

		// 30-min buffer expands to 11:30-14:30
		const busy = mergeBusyIntervals(bookings, dayStart, dayEnd, 30);
		const gaps = computeFreeGaps(dayStart, dayEnd, busy);
		const slots = extractSlotsFromGaps(gaps, 60);

		// Gap 1: 09:00-11:30 (150min) → 1h slots: 09:00, 09:30, 10:00, 10:30 = 4
		// Gap 2: 14:30-21:00 (390min) → 1h slots: 14:30, 15:00, ..., 20:00 = 12
		expect(nth(gaps, 0).endsAt).toEqual(utc("2026-03-10T11:30:00Z"));
		expect(nth(gaps, 1).startsAt).toEqual(utc("2026-03-10T14:30:00Z"));
		expect(slots).toHaveLength(16);
	});
});

// ─── computeBoatDaySlots ───────────────────────────────────────────────────

describe("computeBoatDaySlots", () => {
	it("chains working window → merge → gaps → extract for a UTC boat", () => {
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [interval("2026-07-15T10:00:00Z", "2026-07-15T12:00:00Z")],
			durationMinutes: 120,
		});

		// Window 09-21 UTC, busy 10-12, 2h slots step 30min
		// Gap 09-10 (60min) → 0 slots
		// Gap 12-21 (540min) → (540-120)/30+1 = 15 slots
		expect(slots).toHaveLength(15);
		expect(nth(slots, 0).startsAt).toEqual(utc("2026-07-15T12:00:00Z"));
	});

	it("uses Moscow timezone offset for window boundaries", () => {
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: moscowBoat,
			busyIntervals: [],
			durationMinutes: 60,
		});

		// Moscow summer = UTC+3, window 09-21 local = 06:00-18:00 UTC
		// 12h window, 1h slots, 30min step: (720-60)/30+1 = 23
		expect(slots).toHaveLength(23);
		expect(nth(slots, 0).startsAt).toEqual(utc("2026-07-15T06:00:00Z"));
		expect(nth(slots, 22).endsAt).toEqual(utc("2026-07-15T18:00:00Z"));
	});

	it("applies buffer minutes between bookings", () => {
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [interval("2026-07-15T12:00:00Z", "2026-07-15T14:00:00Z")],
			durationMinutes: 60,
			bufferMinutes: 15,
		});

		// Buffer expands busy to 11:45-14:15, clipped to window 09-21
		// Gap 09:00-11:45 (165min), 1h step 30: 11:00 is last start → 5 slots
		// Gap 14:15-21:00 (405min), 1h step 30: 20:00 is last start → 13 slots (14:15, 14:45, 15:15... 20:15 won't fit if 20:15+60=21:15>21, so 20:00 is last)
		// No slot should overlap the buffered busy interval
		const busyStart = utc("2026-07-15T11:45:00Z").getTime();
		const busyEnd = utc("2026-07-15T14:15:00Z").getTime();

		for (const slot of slots) {
			const slotEnd = slot.endsAt.getTime();
			const slotStart = slot.startsAt.getTime();
			const overlaps = slotStart < busyEnd && slotEnd > busyStart;
			expect(overlaps).toBe(false);
		}
	});

	it("uses custom step minutes", () => {
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [],
			durationMinutes: 120,
			stepMinutes: 60,
		});

		// 12h window, 2h slots, 60min step: (720-120)/60+1 = 11
		expect(slots).toHaveLength(11);
		expect(
			nth(slots, 1).startsAt.getTime() - nth(slots, 0).startsAt.getTime()
		).toBe(60 * 60_000);
	});

	it("handles cross-midnight working hours (nightlife boat)", () => {
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: nightBoat,
			busyIntervals: [],
			durationMinutes: 120,
		});

		// 18:00-02:00 UTC = 8h window, 2h slots step 30min: (480-120)/30+1 = 13
		expect(slots).toHaveLength(13);
		expect(nth(slots, 0).startsAt).toEqual(utc("2026-07-15T18:00:00Z"));
		// Last slot ends at 02:00 next day
		expect(nth(slots, 12).endsAt).toEqual(utc("2026-07-16T02:00:00Z"));
	});

	it("returns empty when fully booked", () => {
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [interval("2026-07-15T08:00:00Z", "2026-07-15T22:00:00Z")],
			durationMinutes: 60,
		});

		expect(slots).toHaveLength(0);
	});

	it("handles many fragmented bookings throughout the day", () => {
		// 5 bookings scattered across the day, some overlapping
		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [
				interval("2026-07-15T09:00:00Z", "2026-07-15T09:30:00Z"),
				interval("2026-07-15T10:00:00Z", "2026-07-15T11:00:00Z"),
				interval("2026-07-15T10:30:00Z", "2026-07-15T11:30:00Z"), // overlaps previous
				interval("2026-07-15T14:00:00Z", "2026-07-15T16:00:00Z"),
				interval("2026-07-15T19:00:00Z", "2026-07-15T20:00:00Z"),
			],
			durationMinutes: 120,
		});

		// Merged busy: 09-09:30, 10-11:30, 14-16, 19-20
		// Gaps: 09:30-10 (30m), 11:30-14 (150m), 16-19 (180m), 20-21 (60m)
		// 2h from 30m gap: 0
		// 2h from 150m gap: 11:30-13:30, 12:00-14:00 = 2
		// 2h from 180m gap: 16-18, 16:30-18:30, 17-19 = 3
		// 2h from 60m gap: 0
		expect(slots).toHaveLength(5);
	});
});

// ─── filterSlotsAfterMinNotice ──────────────────────────────────────────────

describe("filterSlotsAfterMinNotice", () => {
	const sampleSlots = extractSlotsFromGaps(
		[
			{
				startsAt: utc("2026-07-15T09:00:00Z"),
				endsAt: utc("2026-07-15T14:00:00Z"),
				durationMinutes: 300,
			},
		],
		60
	);

	it("keeps all slots when now is far in the past", () => {
		const result = filterSlotsAfterMinNotice(
			sampleSlots,
			utc("2026-07-15T06:00:00Z"),
			60
		);

		expect(result).toHaveLength(sampleSlots.length);
	});

	it("removes slots that start before now + notice period", () => {
		// now=09:30, notice=120min → cutoff=11:30
		// slots starting at 09:00, 09:30, 10:00, 10:30, 11:00 are removed (start < 11:30)
		// slots starting at 11:30, 12:00, 12:30, 13:00 remain
		const result = filterSlotsAfterMinNotice(
			sampleSlots,
			utc("2026-07-15T09:30:00Z"),
			120
		);

		expect(result).toHaveLength(4);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-07-15T11:30:00Z"));
	});

	it("removes all slots when notice period exceeds working window", () => {
		const result = filterSlotsAfterMinNotice(
			sampleSlots,
			utc("2026-07-15T12:00:00Z"),
			120
		);

		// cutoff = 14:00, last slot starts at 13:00, so only 13:00 is gone too (13 < 14)
		// Wait: slots end at 14:00, last start is 13:00 (13:00-14:00). 13:00 < 14:00 → gone
		expect(result).toHaveLength(0);
	});

	it("handles zero notice minutes (no filtering)", () => {
		const result = filterSlotsAfterMinNotice(
			sampleSlots,
			utc("2026-07-15T09:00:00Z"),
			0
		);

		expect(result).toHaveLength(sampleSlots.length);
	});

	it("removes exactly the slots before the cutoff boundary", () => {
		// now=08:00, notice=60min → cutoff=09:00
		// slot at 09:00 starts exactly at cutoff — should be kept (>= cutoff)
		const result = filterSlotsAfterMinNotice(
			sampleSlots,
			utc("2026-07-15T08:00:00Z"),
			60
		);

		expect(result).toHaveLength(sampleSlots.length);
		expect(nth(result, 0).startsAt).toEqual(utc("2026-07-15T09:00:00Z"));
	});
});

// ─── enrichSlotsWithPricing ─────────────────────────────────────────────────

describe("enrichSlotsWithPricing", () => {
	it("attaches base pricing to each slot", () => {
		const profile = makeProfile({ baseHourlyPriceCents: 10_000 });
		const slots = extractSlotsFromGaps(
			[
				{
					startsAt: utc("2026-07-15T09:00:00Z"),
					endsAt: utc("2026-07-15T12:00:00Z"),
					durationMinutes: 180,
				},
			],
			120
		);

		const enriched = enrichSlotsWithPricing({
			slots,
			boatMinimumHours: 1,
			passengers: 2,
			timezone: "UTC",
			profile,
		});

		expect(enriched).toHaveLength(3);
		for (const slot of enriched) {
			expect(slot.durationMinutes).toBe(120);
			expect(slot.estimatedHours).toBe(2);
			// 2h × 10000 = 20000 base
			expect(slot.subtotalCents).toBe(20_000);
			// service 10% (2000) + affiliate 5% (1000) → total = 23000
			expect(slot.totalPriceCents).toBe(23_000);
			expect(slot.currency).toBe("RUB");
			expect(slot.discountLabel).toBeNull();
		}
	});

	it("applies minimum hours when slot is shorter than minimum", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 8000,
			minimumHours: 2,
		});
		const slots = extractSlotsFromGaps(
			[
				{
					startsAt: utc("2026-07-15T09:00:00Z"),
					endsAt: utc("2026-07-15T10:00:00Z"),
					durationMinutes: 60,
				},
			],
			60
		);

		const enriched = enrichSlotsWithPricing({
			slots,
			boatMinimumHours: 2,
			passengers: 1,
			timezone: "UTC",
			profile,
		});

		expect(enriched).toHaveLength(1);
		// Profile minimumHours=2, boat minimumHours=2, slot is 1h
		// estimatedHours = max(ceil(1), 2, 2) = 2
		expect(nth(enriched, 0).estimatedHours).toBe(2);
		expect(nth(enriched, 0).subtotalCents).toBe(16_000); // 2h × 8000
	});

	it("shows duration discount label when rule matches", () => {
		const profile = makeProfile({ baseHourlyPriceCents: 10_000 });
		const durationDiscount = makeRule({
			id: "dur-discount",
			ruleType: "duration_discount",
			adjustmentType: "percentage",
			adjustmentValue: -15,
			conditionJson: JSON.stringify({ minHours: 3 }),
			priority: 1,
		});

		// 3-hour slot → matches duration discount
		const slots = extractSlotsFromGaps(
			[
				{
					startsAt: utc("2026-07-15T09:00:00Z"),
					endsAt: utc("2026-07-15T15:00:00Z"),
					durationMinutes: 360,
				},
			],
			180 // 3h slots
		);

		const enriched = enrichSlotsWithPricing({
			slots,
			boatMinimumHours: 1,
			passengers: 1,
			timezone: "UTC",
			profile,
			pricingRules: [durationDiscount],
		});

		// Without discount: 3h × 10000 = 30000
		// With -15%: 30000 - 4500 = 25500
		expect(nth(enriched, 0).subtotalCents).toBe(25_500);
		expect(nth(enriched, 0).discountLabel).not.toBeNull();
	});

	it("shows different prices for slots at different times of day", () => {
		const profile = makeProfile({ baseHourlyPriceCents: 10_000 });
		// Evening surcharge: +20% between 18:00-23:00
		const eveningSurcharge = makeRule({
			id: "evening",
			ruleType: "time_window",
			adjustmentType: "percentage",
			adjustmentValue: 20,
			conditionJson: JSON.stringify({ startHour: 18, endHour: 23 }),
			priority: 1,
		});

		// Two slots: one at 10:00 (no surcharge), one at 18:00 (surcharge)
		const morningSlot = {
			startsAt: utc("2026-07-15T10:00:00Z"),
			endsAt: utc("2026-07-15T12:00:00Z"),
		};
		const eveningSlot = {
			startsAt: utc("2026-07-15T18:00:00Z"),
			endsAt: utc("2026-07-15T20:00:00Z"),
		};

		const enriched = enrichSlotsWithPricing({
			slots: [morningSlot, eveningSlot],
			boatMinimumHours: 1,
			passengers: 1,
			timezone: "UTC",
			profile,
			pricingRules: [eveningSurcharge],
		});

		// Morning: 2h × 10000 = 20000 (no surcharge)
		expect(nth(enriched, 0).subtotalCents).toBe(20_000);
		// Evening: 2h × 10000 = 20000 + 20% = 24000
		expect(nth(enriched, 1).subtotalCents).toBe(24_000);
		// The surcharge slot should have a label
		expect(nth(enriched, 1).discountLabel).not.toBeNull();
	});

	it("applies weekend surcharge for Saturday slots", () => {
		const profile = makeProfile({ baseHourlyPriceCents: 10_000 });
		const weekendSurcharge = makeRule({
			id: "weekend",
			ruleType: "weekend_surcharge",
			adjustmentType: "percentage",
			adjustmentValue: 30,
			conditionJson: JSON.stringify({ weekendDays: [0, 6] }),
			priority: 1,
		});

		// 2026-07-18 is a Saturday
		const saturdaySlot = {
			startsAt: utc("2026-07-18T10:00:00Z"),
			endsAt: utc("2026-07-18T12:00:00Z"),
		};
		// 2026-07-15 is a Wednesday
		const wednesdaySlot = {
			startsAt: utc("2026-07-15T10:00:00Z"),
			endsAt: utc("2026-07-15T12:00:00Z"),
		};

		const enriched = enrichSlotsWithPricing({
			slots: [saturdaySlot, wednesdaySlot],
			boatMinimumHours: 1,
			passengers: 1,
			timezone: "UTC",
			profile,
			pricingRules: [weekendSurcharge],
		});

		// Saturday: 20000 + 30% = 26000
		expect(nth(enriched, 0).subtotalCents).toBe(26_000);
		// Wednesday: 20000 (no surcharge)
		expect(nth(enriched, 1).subtotalCents).toBe(20_000);
	});

	it("computes payNow as markup and payLater as boat base", () => {
		const profile = makeProfile({
			baseHourlyPriceCents: 10_000,
			depositPercentage: 50,
			serviceFeePercentage: 10,
			affiliateFeePercentage: 5,
		});

		const slots = [
			{
				startsAt: utc("2026-07-15T10:00:00Z"),
				endsAt: utc("2026-07-15T12:00:00Z"),
			},
		];

		const enriched = enrichSlotsWithPricing({
			slots,
			boatMinimumHours: 1,
			passengers: 1,
			timezone: "UTC",
			profile,
		});

		// subtotal = 20000
		// service 10% = 2000, affiliate 5% = 1000, platformFees = 3000
		// total = 23000
		// payNow = platformFees only = 3000
		// payLater = discounted boat base = 20000
		expect(nth(enriched, 0).totalPriceCents).toBe(23_000);
		expect(nth(enriched, 0).payNowCents).toBe(3000);
		expect(nth(enriched, 0).payLaterCents).toBe(20_000);
	});

	it("handles passenger surcharge pricing", () => {
		const profile = makeProfile({ baseHourlyPriceCents: 10_000 });
		const passengerSurcharge = makeRule({
			id: "pax",
			ruleType: "passenger_surcharge",
			adjustmentType: "fixed_cents",
			adjustmentValue: 500,
			conditionJson: JSON.stringify({ includedPassengers: 4 }),
			priority: 1,
		});

		const slots = [
			{
				startsAt: utc("2026-07-15T10:00:00Z"),
				endsAt: utc("2026-07-15T12:00:00Z"),
			},
		];

		const enrichedNormal = enrichSlotsWithPricing({
			slots,
			boatMinimumHours: 1,
			passengers: 3, // within included, no surcharge
			timezone: "UTC",
			profile,
			pricingRules: [passengerSurcharge],
		});

		const enrichedOver = enrichSlotsWithPricing({
			slots,
			boatMinimumHours: 1,
			passengers: 7, // 3 extra passengers
			timezone: "UTC",
			profile,
			pricingRules: [passengerSurcharge],
		});

		// 3 passengers (within 4 included) → no surcharge
		expect(nth(enrichedNormal, 0).subtotalCents).toBe(20_000);
		// 7 passengers (3 extra × 500) → +1500
		expect(nth(enrichedOver, 0).subtotalCents).toBe(21_500);
	});
});

// ─── realistic multi-boat scenarios ─────────────────────────────────────────

describe("multi-boat availability search simulation", () => {
	// Simulate what the searchAvailability endpoint will do:
	// for each candidate boat, compute slots, enrich with pricing, filter by constraints

	const boats = {
		speedboat: {
			config: { ...utcBoat, minimumHours: 1 } as BoatDayConfig,
			profile: makeProfile({
				id: "p-speed",
				boatId: "speedboat",
				baseHourlyPriceCents: 15_000,
			}),
			bookings: [
				interval("2026-07-15T10:00:00Z", "2026-07-15T12:00:00Z"),
				interval("2026-07-15T15:00:00Z", "2026-07-15T17:00:00Z"),
			],
		},
		yacht: {
			config: {
				workingHoursStart: 8,
				workingHoursEnd: 20,
				timezone: "UTC",
				minimumHours: 3,
			} as BoatDayConfig,
			profile: makeProfile({
				id: "p-yacht",
				boatId: "yacht",
				baseHourlyPriceCents: 50_000,
			}),
			bookings: [interval("2026-07-15T08:00:00Z", "2026-07-15T14:00:00Z")],
		},
		catamaran: {
			config: { ...moscowBoat } as BoatDayConfig,
			profile: makeProfile({
				id: "p-cat",
				boatId: "catamaran",
				baseHourlyPriceCents: 25_000,
			}),
			bookings: [], // completely free
		},
		fullyBooked: {
			config: { ...utcBoat } as BoatDayConfig,
			profile: makeProfile({
				id: "p-full",
				boatId: "fullyBooked",
				baseHourlyPriceCents: 10_000,
			}),
			bookings: [interval("2026-07-15T09:00:00Z", "2026-07-15T21:00:00Z")],
		},
	};

	it("identifies which boats have 2-hour slots available", () => {
		const results = Object.entries(boats).map(([name, boat]) => {
			const slots = computeBoatDaySlots({
				date: "2026-07-15",
				boat: boat.config,
				busyIntervals: boat.bookings,
				durationMinutes: 120,
			});
			return {
				name,
				slotCount: slots.length,
				hasAvailability: slots.length > 0,
			};
		});

		const available = results.filter((r) => r.hasAvailability);
		const unavailable = results.filter((r) => !r.hasAvailability);

		// Speedboat: gaps 09-10(60m), 12-15(180m), 17-21(240m) → 2h slots exist
		// Yacht: gap 14-20(360m) → 2h slots exist
		// Catamaran: fully free → lots of slots
		// FullyBooked: no gaps
		expect(available.map((r) => r.name)).toEqual(
			expect.arrayContaining(["speedboat", "yacht", "catamaran"])
		);
		expect(unavailable.map((r) => r.name)).toEqual(["fullyBooked"]);
	});

	it("identifies which boats have 3-hour slots available", () => {
		const results = Object.entries(boats).map(([name, boat]) => {
			const slots = computeBoatDaySlots({
				date: "2026-07-15",
				boat: boat.config,
				busyIntervals: boat.bookings,
				durationMinutes: 180,
			});
			return { name, slotCount: slots.length };
		});

		const resultMap = Object.fromEntries(
			results.map((r) => [r.name, r.slotCount])
		);

		// Speedboat: 12-15 gap (180m) → 1 exact fit; 17-21 (240m) → 3 slots → total 4
		// Yacht: 14-20 gap (360m) → 3h/30min step: 7 slots
		// Catamaran: big window, lots of slots
		// FullyBooked: 0
		expect(resultMap.speedboat).toBeGreaterThan(0);
		expect(resultMap.yacht).toBeGreaterThan(0);
		expect(resultMap.catamaran).toBeGreaterThan(0);
		expect(resultMap.fullyBooked).toBe(0);
	});

	it("computes per-boat price ranges for search results", () => {
		const priceRanges = Object.entries(boats)
			.filter(([name]) => name !== "fullyBooked")
			.map(([name, boat]) => {
				const slots = computeBoatDaySlots({
					date: "2026-07-15",
					boat: boat.config,
					busyIntervals: boat.bookings,
					durationMinutes: 120,
				});
				const enriched = enrichSlotsWithPricing({
					slots,
					boatMinimumHours: boat.config.minimumHours,
					passengers: 2,
					timezone: boat.config.timezone,
					profile: boat.profile,
				});
				const prices = enriched.map((s) => s.totalPriceCents);
				return {
					name,
					minPrice: Math.min(...prices),
					maxPrice: Math.max(...prices),
					slotCount: enriched.length,
				};
			});

		// All boats have consistent pricing (no time-of-day rules), so min===max
		for (const range of priceRanges) {
			expect(range.minPrice).toBe(range.maxPrice);
			expect(range.slotCount).toBeGreaterThan(0);
		}

		// Yacht is most expensive per hour
		const yachtRange = priceRanges.find((r) => r.name === "yacht");
		const speedRange = priceRanges.find((r) => r.name === "speedboat");
		expect(yachtRange?.minPrice).toBeGreaterThan(speedRange?.minPrice ?? 0);
	});

	it("filters boats by max price constraint", () => {
		const maxBudgetCents = 40_000; // 400 RUB max total

		const affordable = Object.entries(boats)
			.filter(([name]) => name !== "fullyBooked")
			.filter(([, boat]) => {
				const slots = computeBoatDaySlots({
					date: "2026-07-15",
					boat: boat.config,
					busyIntervals: boat.bookings,
					durationMinutes: 120,
				});
				const enriched = enrichSlotsWithPricing({
					slots,
					boatMinimumHours: boat.config.minimumHours,
					passengers: 1,
					timezone: boat.config.timezone,
					profile: boat.profile,
				});
				return enriched.some((s) => s.totalPriceCents <= maxBudgetCents);
			})
			.map(([name]) => name);

		// Speedboat: 2h × 15000 = 30000 + 15% fees = 34500 → affordable
		// Catamaran: 2h × 25000 = 50000 + fees → 57500 → too expensive
		// Yacht: 2h × 50000 = 100000 + fees → too expensive (but min 3h anyway)
		expect(affordable).toContain("speedboat");
		expect(affordable).not.toContain("yacht");
	});

	it("applies minimum notice to filter stale morning slots", () => {
		const now = utc("2026-07-15T11:00:00Z");
		const noticeMinutes = 60;

		const slots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [],
			durationMinutes: 120,
		});

		const filtered = filterSlotsAfterMinNotice(slots, now, noticeMinutes);

		// cutoff = 12:00, so slots starting before 12:00 are removed
		expect(nth(filtered, 0).startsAt).toEqual(utc("2026-07-15T12:00:00Z"));
		expect(filtered.length).toBeLessThan(slots.length);
	});

	it("supports multi-duration search (1h, 2h, 3h options for same boat)", () => {
		const durations = [60, 120, 180];
		const results = durations.map((durationMinutes) => {
			const slots = computeBoatDaySlots({
				date: "2026-07-15",
				boat: utcBoat,
				busyIntervals: [
					interval("2026-07-15T12:00:00Z", "2026-07-15T14:00:00Z"),
				],
				durationMinutes,
			});
			const enriched = enrichSlotsWithPricing({
				slots,
				boatMinimumHours: utcBoat.minimumHours,
				passengers: 1,
				timezone: utcBoat.timezone,
				profile: makeProfile(),
			});
			return {
				duration: durationMinutes,
				slotCount: slots.length,
				priceRange:
					enriched.length > 0
						? {
								min: Math.min(...enriched.map((s) => s.totalPriceCents)),
								max: Math.max(...enriched.map((s) => s.totalPriceCents)),
							}
						: null,
			};
		});

		// More slots for shorter durations
		expect(nth(results, 0).slotCount).toBeGreaterThan(
			nth(results, 1).slotCount
		);
		expect(nth(results, 1).slotCount).toBeGreaterThan(
			nth(results, 2).slotCount
		);

		// Price increases with duration (minimumHours=2 for utcBoat)
		// 1h slot: estimatedHours=2 (minimum), 2h slot: estimatedHours=2, 3h: estimatedHours=3
		// So 1h and 2h should have same price, 3h should be higher
		expect(nth(results, 0).priceRange?.min).toBe(
			nth(results, 1).priceRange?.min
		);
		expect(nth(results, 2).priceRange?.min).toBeGreaterThan(
			nth(results, 1).priceRange?.min ?? 0
		);
	});

	it("combines discount rules with slot computation for search display", () => {
		const profile = makeProfile({ baseHourlyPriceCents: 10_000 });
		const durationDiscount = makeRule({
			id: "dur-5h",
			ruleType: "duration_discount",
			adjustmentType: "percentage",
			adjustmentValue: -20,
			conditionJson: JSON.stringify({ minHours: 4 }),
		});

		// Free day, generate both 2h and 4h slots
		const shortSlots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [],
			durationMinutes: 120,
			stepMinutes: 60,
		});
		const longSlots = computeBoatDaySlots({
			date: "2026-07-15",
			boat: utcBoat,
			busyIntervals: [],
			durationMinutes: 240,
			stepMinutes: 60,
		});

		const shortEnriched = enrichSlotsWithPricing({
			slots: shortSlots,
			boatMinimumHours: 1,
			passengers: 1,
			timezone: "UTC",
			profile,
			pricingRules: [durationDiscount],
		});
		const longEnriched = enrichSlotsWithPricing({
			slots: longSlots,
			boatMinimumHours: 1,
			passengers: 1,
			timezone: "UTC",
			profile,
			pricingRules: [durationDiscount],
		});

		// Short (2h): no discount → 20000 subtotal
		expect(nth(shortEnriched, 0).subtotalCents).toBe(20_000);
		expect(nth(shortEnriched, 0).discountLabel).toBeNull();

		// Long (4h): -20% discount → 40000 - 8000 = 32000
		expect(nth(longEnriched, 0).subtotalCents).toBe(32_000);
		expect(nth(longEnriched, 0).discountLabel).not.toBeNull();
	});
});
