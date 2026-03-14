import type {
	PublicBookingSlotStatus,
	PublicBookingSurfaceSlot,
} from "../types";
import {
	type BusyWindow,
	findBusyWindow,
	formatTimeInZone,
	type MinimumDurationRuleWindow,
	type MinuteWindow,
	resolveRequiredMinimumDuration,
	SLOT_STEP_MINUTES,
	toSlotStatusLabel,
	zonedLocalDateTimeToUtc,
} from "./availability";

export interface RawPublicBookingSurfaceSlot
	extends Omit<PublicBookingSurfaceSlot, "quote"> {
	endsAtDate: Date;
	startsAtDate: Date;
}

export const buildRawSlots = (params: {
	availabilityWindows: MinuteWindow[];
	busyWindows: BusyWindow[];
	date: string;
	durationMinutes: number;
	dayOfWeek: number;
	listingTimezone: string;
	noticeCutoffMs: number;
	baseMinimumDurationMinutes: number;
	minimumDurationRules: MinimumDurationRuleWindow[];
}): RawPublicBookingSurfaceSlot[] => {
	const rawSlots: RawPublicBookingSurfaceSlot[] = [];

	for (const window of params.availabilityWindows) {
		for (
			let minute = window.startMinute;
			minute + params.durationMinutes <= window.endMinute;
			minute += SLOT_STEP_MINUTES
		) {
			const startsAtDate = zonedLocalDateTimeToUtc(
				params.date,
				minute,
				params.listingTimezone
			);
			const endsAtDate = new Date(
				startsAtDate.getTime() + params.durationMinutes * 60_000
			);
			const requiredMinimumDuration = resolveRequiredMinimumDuration({
				baseMinimumDurationMinutes: params.baseMinimumDurationMinutes,
				dayOfWeek: params.dayOfWeek,
				slotMinuteOfDay: minute,
				rules: params.minimumDurationRules,
			});
			const overlap = findBusyWindow(
				params.busyWindows,
				startsAtDate,
				endsAtDate
			);

			let status: PublicBookingSlotStatus = "available";
			if (overlap) {
				status = "blocked";
			} else if (startsAtDate.getTime() < params.noticeCutoffMs) {
				status = "notice_too_short";
			} else if (params.durationMinutes < requiredMinimumDuration) {
				status = "minimum_duration_not_met";
			}

			rawSlots.push({
				blockReason: overlap?.reason ?? null,
				blockSource: overlap?.source ?? null,
				endsAt: endsAtDate.toISOString(),
				endsAtDate,
				endsAtLabel: formatTimeInZone(endsAtDate, params.listingTimezone),
				minimumDurationMinutes: requiredMinimumDuration,
				startsAt: startsAtDate.toISOString(),
				startsAtDate,
				startsAtLabel: formatTimeInZone(startsAtDate, params.listingTimezone),
				status,
				statusLabel: toSlotStatusLabel(status),
			});
		}
	}

	return rawSlots;
};
