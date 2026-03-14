import type {
	Db,
	PublicBookingSurface,
	PublicBookingSurfaceInput,
} from "../types";
import {
	getWeekdayForDateString,
	MINUTE_MS,
	nextDateString,
	resolveAvailabilityWindows,
	SLOT_STEP_MINUTES,
	zonedLocalDateTimeToUtc,
} from "./availability";
import { resolveSlotQuote } from "./pricing";
import { preparePromotionContext } from "./promotions";
import {
	loadPublicBookingSurfaceListing,
	loadPublicBookingSurfaceState,
} from "./query";
import { buildRawSlots } from "./slots";
import { summarizeSlots } from "./summary";

export async function getPublicBookingSurface(
	input: PublicBookingSurfaceInput,
	db: Db,
	options?: { now?: Date; customerUserId?: string },
): Promise<PublicBookingSurface> {
	const weekday = getWeekdayForDateString(input.date);
	const listingRow = await loadPublicBookingSurfaceListing(input.listingId, db);
	const dayStart = zonedLocalDateTimeToUtc(input.date, 0, listingRow.timezone);
	const dayEnd = zonedLocalDateTimeToUtc(
		nextDateString(input.date),
		0,
		listingRow.timezone,
	);
	const queryState = await loadPublicBookingSurfaceState(
		{
			...input,
			dayStart,
			dayEnd,
			weekday,
		},
		listingRow,
		db,
	);

	const availabilityWindows = resolveAvailabilityWindows({
		workingHoursStart: queryState.listing.workingHoursStart,
		workingHoursEnd: queryState.listing.workingHoursEnd,
		exception: queryState.exception,
		rules: queryState.rules,
	});
	const noticeCutoffMs =
		(options?.now ?? new Date()).getTime() +
		queryState.listing.minimumNoticeMinutes * MINUTE_MS;
	const rawSlots = buildRawSlots({
		availabilityWindows,
		busyWindows: queryState.busyWindows,
		date: input.date,
		durationMinutes: input.durationMinutes,
		dayOfWeek: weekday,
		listingTimezone: queryState.listing.timezone,
		noticeCutoffMs,
		baseMinimumDurationMinutes: queryState.listing.minimumDurationMinutes,
		minimumDurationRules: queryState.minimumDurationRules,
	});
	const durationOptionsMinutes = [
		...new Set(
			[
				queryState.listing.minimumDurationMinutes,
				...rawSlots.map((slot) => slot.minimumDurationMinutes),
			].sort((left, right) => left - right),
		),
	];
	const promotionContext = await preparePromotionContext(
		{
			organizationId: queryState.listing.organizationId,
			listingId: input.listingId,
			discountCode: input.discountCode,
			customerUserId: options?.customerUserId,
			now: options?.now,
		},
		db,
	);

	const slots = rawSlots.map((slot) => {
		if (slot.status !== "available") {
			const { startsAtDate, endsAtDate, ...rest } = slot;
			return {
				...rest,
				quote: null,
			};
		}

		try {
			const quote = resolveSlotQuote({
				listingId: input.listingId,
				startsAt: slot.startsAtDate,
				endsAt: slot.endsAtDate,
				passengers: input.passengers,
				pricingContext: queryState.pricingContext,
				promotionContext,
			});
			const { startsAtDate, endsAtDate, ...rest } = slot;
			return {
				...rest,
				quote,
			};
		} catch {
			const { startsAtDate, endsAtDate, ...rest } = slot;
			return {
				...rest,
				quote: null,
			};
		}
	});

	return {
		currency:
			queryState.pricingContext?.profile.currency ??
			slots.find((slot) => slot.quote)?.quote?.currency ??
			null,
		date: input.date,
		durationOptionsMinutes,
		listingId: input.listingId,
		minimumDurationMinutes: queryState.listing.minimumDurationMinutes,
		minimumNoticeMinutes: queryState.listing.minimumNoticeMinutes,
		passengers: input.passengers ?? null,
		pricingConfigured: queryState.pricingContext !== null,
		requestedDurationMinutes: input.durationMinutes,
		requestedDiscountCode: input.discountCode?.trim().toUpperCase() ?? null,
		serviceFamily: "boat_rent",
		slotStepMinutes: SLOT_STEP_MINUTES,
		slots,
		summary: summarizeSlots(slots),
		timezone: queryState.listing.timezone,
	};
}
