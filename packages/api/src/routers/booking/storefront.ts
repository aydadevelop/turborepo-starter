import { db } from "@full-stack-cf-app/db";
import {
	type BoatType,
	boat,
	boatAmenity,
	boatAsset,
	boatAvailabilityBlock,
	boatDock,
	boatMinimumDurationRule,
	boatPricingProfile,
	boatPricingRule,
} from "@full-stack-cf-app/db/schema/boat";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import { notificationsPusher } from "@full-stack-cf-app/notifications/pusher";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	countDistinct,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lt,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { publicProcedure } from "../../index";
import { buildRecipients } from "../../lib/event-bus";
import {
	availabilityPublicOutputSchema,
	checkoutReadModelPublicOutputSchema,
	createPublicBookingInputSchema,
	createPublicBookingOutputSchema,
	getBoatByIdPublicInputSchema,
	getBoatByIdPublicOutputSchema,
	getPublicBookingQuoteInputSchema,
	getPublicCheckoutReadModelInputSchema,
	listPublicBoatAvailabilityInputSchema,
	quotePublicOutputSchema,
} from "../booking.schemas";
import {
	createManagedBookingRecord,
	ensureNoAvailabilityBlockOverlap,
	ensureNoBookingOverlap,
	resolveActivePricingProfile,
	resolvePrimaryCalendarLinkInput,
} from "./core";
import { resolveBookingDiscount } from "./discount/resolution";
import {
	blockingBookingStatuses,
	type CreateManagedBookingInput,
} from "./helpers";
import {
	attachAffiliateAttributionToBooking,
	resolveAffiliateReferralFromContext,
} from "./services/affiliate";
import { sortByAvailabilityBands } from "./services/availability-ranking";
import { ensureNoExternalCalendarOverlap } from "./services/calendar-sync";
import { buildCheckoutReadModel } from "./services/checkout-read-model";
import { enqueueBookingExpirationCheck } from "./services/expiration";
import {
	type BoatPricingRule,
	buildBookingPricingQuote,
	estimateBookingSubtotalCentsFromProfile,
} from "./services/pricing";
import {
	annotateSlotMinimumDuration,
	type BusyInterval,
	buildDurationOptions,
	computeBoatDaySlots,
	enrichSlotsWithPricing,
	filterSlotsAfterMinNotice,
	type MinimumDurationRule,
	resolveWorkingWindow,
} from "./services/slots";

const dateFormatterByTimeZone = new Map<string, Intl.DateTimeFormat>();
const DAY_MS = 24 * 60 * 60 * 1000;

const getDateStringInTimeZone = (date: Date, timeZone: string): string => {
	let formatter = dateFormatterByTimeZone.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		dateFormatterByTimeZone.set(timeZone, formatter);
	}

	const parts = formatter.formatToParts(date);
	const getPart = (type: Intl.DateTimeFormatPartTypes): string => {
		const part = parts.find((entry) => entry.type === type);
		return part?.value ?? "";
	};

	return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
};

export const resolvePublicBookingQuote = async (params: {
	context: {
		session: {
			user: {
				id: string;
			};
		} | null;
	};
	input: {
		boatId: string;
		startsAt: Date;
		endsAt: Date;
		passengers: number;
		discountCode?: string;
	};
}) => {
	const [publicBoat] = await db
		.select()
		.from(boat)
		.where(
			and(
				eq(boat.id, params.input.boatId),
				eq(boat.status, "active"),
				eq(boat.isActive, true),
				isNull(boat.archivedAt)
			)
		)
		.limit(1);

	if (!publicBoat) {
		throw new ORPCError("NOT_FOUND");
	}

	if (params.input.passengers > publicBoat.passengerCapacity) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Passenger count exceeds boat capacity",
		});
	}

	await ensureNoBookingOverlap({
		organizationId: publicBoat.organizationId,
		boatId: publicBoat.id,
		startsAt: params.input.startsAt,
		endsAt: params.input.endsAt,
	});
	await ensureNoAvailabilityBlockOverlap({
		boatId: publicBoat.id,
		startsAt: params.input.startsAt,
		endsAt: params.input.endsAt,
	});

	const calendarLink = await resolvePrimaryCalendarLinkInput({
		boatId: publicBoat.id,
	});
	await ensureNoExternalCalendarOverlap({
		provider: calendarLink.provider,
		externalCalendarId: calendarLink.externalCalendarId,
		startsAt: params.input.startsAt,
		endsAt: params.input.endsAt,
	});

	const activePricingProfile = await resolveActivePricingProfile({
		boatId: publicBoat.id,
		startsAt: params.input.startsAt,
	});
	const allPricingRules = await db
		.select()
		.from(boatPricingRule)
		.where(
			and(
				eq(boatPricingRule.boatId, publicBoat.id),
				eq(boatPricingRule.isActive, true)
			)
		);
	const pricingRules = allPricingRules.filter(
		(rule) =>
			!rule.pricingProfileId ||
			rule.pricingProfileId === activePricingProfile.id
	);

	const { estimatedHours, subtotalCents } =
		estimateBookingSubtotalCentsFromProfile({
			startsAt: params.input.startsAt,
			endsAt: params.input.endsAt,
			boatMinimumHours: publicBoat.minimumHours,
			passengers: params.input.passengers,
			timeZone: publicBoat.timezone,
			profile: activePricingProfile,
			pricingRules,
		});
	const pricingQuote = buildBookingPricingQuote({
		profile: activePricingProfile,
		estimatedHours,
		subtotalCents,
	});

	const sessionUserId = params.context.session?.user.id;
	const resolvedDiscount = await resolveBookingDiscount({
		organizationId: publicBoat.organizationId,
		boatId: publicBoat.id,
		startsAt: params.input.startsAt,
		basePriceCents: subtotalCents,
		discountCode: params.input.discountCode,
		customerUserId: sessionUserId,
	});

	const discountedSubtotalCents = Math.max(
		subtotalCents - (resolvedDiscount?.discountAmountCents ?? 0),
		0
	);
	const pricingQuoteAfterDiscount = buildBookingPricingQuote({
		profile: activePricingProfile,
		estimatedHours,
		subtotalCents: discountedSubtotalCents,
	});

	return {
		publicBoat,
		calendarLink,
		pricingQuote,
		pricingQuoteAfterDiscount,
		resolvedDiscount,
		sessionUserId,
		estimatedTotalAfterDiscountCents:
			pricingQuoteAfterDiscount.estimatedTotalPriceCents,
		estimatedPayNowAfterDiscountCents:
			pricingQuoteAfterDiscount.estimatedPayNowCents,
		estimatedPayLaterAfterDiscountCents:
			pricingQuoteAfterDiscount.estimatedPayLaterCents,
	};
};

interface AvailabilityResult {
	boat: typeof boat.$inferSelect;
	pricingQuote: ReturnType<typeof buildBookingPricingQuote>;
	available: boolean;
	windowStartsAt: Date;
	windowEndsAt: Date;
	activePricingProfile: typeof boatPricingProfile.$inferSelect;
	activeRules: BoatPricingRule[];
}

interface PublicAvailabilityItem {
	boat: AvailabilityResult["boat"];
	pricingQuote: AvailabilityResult["pricingQuote"];
	available: boolean;
	slots?: ReturnType<typeof enrichSlotsWithPricing>;
}

interface PublicAvailabilitySearchInput {
	startsAt?: Date;
	endsAt?: Date;
	date?: string;
	durationHours?: number;
	passengers: number;
	includeUnavailable?: boolean;
	minEstimatedTotalCents?: number;
	maxEstimatedTotalCents?: number;
}

type AvailabilitySearchMode = "range" | "date_duration";

const resolveAvailabilitySearchMode = (
	input: PublicAvailabilitySearchInput
): AvailabilitySearchMode => {
	if (input.startsAt && input.endsAt) {
		return "range";
	}

	if (input.date && input.durationHours !== undefined) {
		return "date_duration";
	}

	throw new ORPCError("BAD_REQUEST", {
		message: "Provide either startsAt/endsAt or date/durationHours",
	});
};

const resolveBroadAvailabilityWindow = (params: {
	input: PublicAvailabilitySearchInput;
	mode: AvailabilitySearchMode;
}): { startsAt: Date; endsAt: Date } => {
	if (params.mode === "range") {
		return {
			startsAt: params.input.startsAt as Date,
			endsAt: params.input.endsAt as Date,
		};
	}

	const date = params.input.date as string;
	const dayStartUtc = new Date(`${date}T00:00:00.000Z`);

	return {
		startsAt: new Date(dayStartUtc.getTime() - 2 * DAY_MS),
		endsAt: new Date(dayStartUtc.getTime() + 3 * DAY_MS),
	};
};

const resolveCandidateWindowForBoat = (params: {
	candidateBoat: typeof boat.$inferSelect;
	input: PublicAvailabilitySearchInput;
	mode: AvailabilitySearchMode;
}): { startsAt: Date; endsAt: Date; durationMinutes: number } => {
	if (params.mode === "range") {
		const startsAt = params.input.startsAt as Date;
		const endsAt = params.input.endsAt as Date;
		const durationMinutes = Math.max(
			30,
			Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)
		);

		return { startsAt, endsAt, durationMinutes };
	}

	const { dayStart } = resolveWorkingWindow({
		date: params.input.date as string,
		workingHoursStart: params.candidateBoat.workingHoursStart,
		workingHoursEnd: params.candidateBoat.workingHoursEnd,
		timezone: params.candidateBoat.timezone,
	});
	const durationMinutes = Math.max(
		30,
		Math.round((params.input.durationHours as number) * 60)
	);

	return {
		startsAt: dayStart,
		endsAt: new Date(dayStart.getTime() + durationMinutes * 60_000),
		durationMinutes,
	};
};

const hasOverlap = (intervals: BusyInterval[], startsAt: Date, endsAt: Date) =>
	intervals.some(
		(interval) => interval.startsAt < endsAt && interval.endsAt > startsAt
	);

const violatesMinimumDurationRules = (params: {
	candidateBoat: typeof boat.$inferSelect;
	startsAt: Date;
	endsAt: Date;
	minimumDurationRules: MinimumDurationRule[];
}) => {
	const [requestedSlot] = annotateSlotMinimumDuration({
		slots: [
			{
				startsAt: params.startsAt,
				endsAt: params.endsAt,
			},
		],
		boatMinimumHours: params.candidateBoat.minimumHours,
		minimumDurationRules: params.minimumDurationRules,
		timezone: params.candidateBoat.timezone,
	});

	if (!requestedSlot) {
		return false;
	}

	const requestedDurationMinutes = Math.max(
		30,
		Math.round(
			(params.endsAt.getTime() - params.startsAt.getTime()) / 60_000
		)
	);

	return requestedDurationMinutes < requestedSlot.requiredMinimumDurationMinutes;
};

const buildBusyIntervalsByBoatId = (
	rows: Array<{
		boatId: string;
		startsAt: Date;
		endsAt: Date;
	}>
) => {
	const map = new Map<string, BusyInterval[]>();
	for (const row of rows) {
		const existing = map.get(row.boatId);
		if (existing) {
			existing.push({ startsAt: row.startsAt, endsAt: row.endsAt });
		} else {
			map.set(row.boatId, [{ startsAt: row.startsAt, endsAt: row.endsAt }]);
		}
	}
	return map;
};

const resolveActivePricingProfileForWindow = (params: {
	profiles: (typeof boatPricingProfile.$inferSelect)[];
	startsAt: Date;
}) =>
	params.profiles.find(
		(profile) =>
			profile.validFrom <= params.startsAt &&
			(profile.validTo === null || profile.validTo > params.startsAt)
	) ?? null;

const fetchBusyIntervalsForBoats = async (items: AvailabilityResult[]) => {
	const boatIds = items.map((item) => item.boat.id);
	if (boatIds.length === 0) {
		return new Map<string, BusyInterval[]>();
	}

	const [slotBookings, slotBlocks] = await Promise.all([
		db
			.select({
				boatId: booking.boatId,
				startsAt: booking.startsAt,
				endsAt: booking.endsAt,
			})
			.from(booking)
			.where(
				and(
					inArray(booking.boatId, boatIds),
					inArray(booking.status, blockingBookingStatuses)
				)
			),
		db
			.select({
				boatId: boatAvailabilityBlock.boatId,
				startsAt: boatAvailabilityBlock.startsAt,
				endsAt: boatAvailabilityBlock.endsAt,
			})
			.from(boatAvailabilityBlock)
			.where(
				and(
					inArray(boatAvailabilityBlock.boatId, boatIds),
					eq(boatAvailabilityBlock.isActive, true)
				)
			),
	]);

	const busyByBoatId = new Map<string, BusyInterval[]>();
	for (const b of slotBookings) {
		const arr = busyByBoatId.get(b.boatId) ?? [];
		arr.push({ startsAt: b.startsAt, endsAt: b.endsAt });
		busyByBoatId.set(b.boatId, arr);
	}
	for (const b of slotBlocks) {
		const arr = busyByBoatId.get(b.boatId) ?? [];
		arr.push({ startsAt: b.startsAt, endsAt: b.endsAt });
		busyByBoatId.set(b.boatId, arr);
	}

	return busyByBoatId;
};

const enrichBoatWithSlots = (
	r: AvailabilityResult,
	busyIntervals: BusyInterval[],
	startsAt: Date,
	durationMinutes: number,
	now: Date,
	passengers: number,
	minimumDurationRules: MinimumDurationRule[] = []
) => {
	const dateStr = getDateStringInTimeZone(startsAt, r.boat.timezone);
	const rawSlots = computeBoatDaySlots({
		date: dateStr,
		boat: {
			workingHoursStart: r.boat.workingHoursStart,
			workingHoursEnd: r.boat.workingHoursEnd,
			timezone: r.boat.timezone,
			minimumHours: r.boat.minimumHours,
		},
		busyIntervals,
		durationMinutes,
	});
	const filtered = filterSlotsAfterMinNotice(
		rawSlots,
		now,
		r.boat.minimumNoticeMinutes
	);
	const annotated = annotateSlotMinimumDuration({
		slots: filtered,
		boatMinimumHours: r.boat.minimumHours,
		minimumDurationRules,
		timezone: r.boat.timezone,
	});
	return enrichSlotsWithPricing({
		slots: annotated,
		boatMinimumHours: r.boat.minimumHours,
		passengers,
		timezone: r.boat.timezone,
		profile: r.activePricingProfile,
		pricingRules: r.activeRules,
	});
};

const scoreCandidate = (
	candidateBoat: typeof boat.$inferSelect,
	input: PublicAvailabilitySearchInput,
	mode: AvailabilitySearchMode,
	bookingBusyByBoatId: Map<string, BusyInterval[]>,
	blockBusyByBoatId: Map<string, BusyInterval[]>,
	minDurationRulesByBoatId: Map<string, MinimumDurationRule[]>,
	pricingProfilesByBoatId: Map<
		string,
		(typeof boatPricingProfile.$inferSelect)[]
	>,
	pricingRulesByBoatId: Map<string, BoatPricingRule[]>
): AvailabilityResult | null => {
	const { startsAt, endsAt } = resolveCandidateWindowForBoat({
		candidateBoat,
		input,
		mode,
	});

	const bookingBusyIntervals = bookingBusyByBoatId.get(candidateBoat.id) ?? [];
	const blockBusyIntervals = blockBusyByBoatId.get(candidateBoat.id) ?? [];
	const minimumDurationRules = minDurationRulesByBoatId.get(candidateBoat.id) ?? [];
	const isDurationInvalid = violatesMinimumDurationRules({
		candidateBoat,
		startsAt,
		endsAt,
		minimumDurationRules,
	});
	const isUnavailable =
		hasOverlap(bookingBusyIntervals, startsAt, endsAt) ||
		hasOverlap(blockBusyIntervals, startsAt, endsAt) ||
		isDurationInvalid;

	if (isUnavailable && !input.includeUnavailable) {
		return null;
	}

	const boatProfiles = pricingProfilesByBoatId.get(candidateBoat.id) ?? [];
	const activePricingProfile = resolveActivePricingProfileForWindow({
		profiles: boatProfiles,
		startsAt,
	});
	if (!activePricingProfile) {
		return null;
	}

	const allRules = pricingRulesByBoatId.get(candidateBoat.id) ?? [];
	const activeRules = allRules.filter(
		(rule) =>
			!rule.pricingProfileId ||
			rule.pricingProfileId === activePricingProfile.id
	);

	const { estimatedHours, subtotalCents } =
		estimateBookingSubtotalCentsFromProfile({
			startsAt,
			endsAt,
			boatMinimumHours: candidateBoat.minimumHours,
			passengers: input.passengers,
			timeZone: candidateBoat.timezone,
			profile: activePricingProfile,
			pricingRules: activeRules,
		});
	const pricingQuote = buildBookingPricingQuote({
		profile: activePricingProfile,
		estimatedHours,
		subtotalCents,
	});

	if (
		input.minEstimatedTotalCents !== undefined &&
		pricingQuote.estimatedTotalPriceCents < input.minEstimatedTotalCents
	) {
		return null;
	}
	if (
		input.maxEstimatedTotalCents !== undefined &&
		pricingQuote.estimatedTotalPriceCents > input.maxEstimatedTotalCents
	) {
		return null;
	}

	return {
		boat: candidateBoat,
		pricingQuote,
		available: !isUnavailable,
		windowStartsAt: startsAt,
		windowEndsAt: endsAt,
		activePricingProfile,
		activeRules,
	};
};

const buildAmenityCounts = (
	rows: Array<{ key: string; count: number | string | bigint }>
) => {
	const amenityCounts: Record<string, number> = {};
	for (const row of rows) {
		amenityCounts[row.key] = Number(row.count);
	}
	return amenityCounts;
};

const scoreCandidateBoats = (params: {
	candidateBoats: (typeof boat.$inferSelect)[];
	input: PublicAvailabilitySearchInput;
	mode: AvailabilitySearchMode;
	bookingBusyByBoatId: Map<string, BusyInterval[]>;
	blockBusyByBoatId: Map<string, BusyInterval[]>;
	minDurationRulesByBoatId: Map<string, MinimumDurationRule[]>;
	pricingProfilesByBoatId: Map<
		string,
		(typeof boatPricingProfile.$inferSelect)[]
	>;
	pricingRulesByBoatId: Map<string, BoatPricingRule[]>;
}) => {
	const resultsWithAvailability: AvailabilityResult[] = [];
	for (const candidateBoat of params.candidateBoats) {
		const result = scoreCandidate(
			candidateBoat,
			params.input,
			params.mode,
			params.bookingBusyByBoatId,
			params.blockBusyByBoatId,
			params.minDurationRulesByBoatId,
			params.pricingProfilesByBoatId,
			params.pricingRulesByBoatId
		);
		if (result) {
			resultsWithAvailability.push(result);
		}
	}
	return resultsWithAvailability;
};

const resolveAvailabilityDurationMinutes = (params: {
	mode: AvailabilitySearchMode;
	input: PublicAvailabilitySearchInput;
}) =>
	params.mode === "range"
		? Math.max(
				30,
				Math.round(
					((params.input.endsAt as Date).getTime() -
						(params.input.startsAt as Date).getTime()) /
						60_000
				)
			)
		: Math.max(30, Math.round((params.input.durationHours as number) * 60));

const sortAvailabilityResults = (
	results: AvailabilityResult[],
	sortBy?: string,
	options?: {
		slotStartsByBoatId?: ReadonlyMap<string, readonly Date[]>;
		now?: Date;
	}
) => {
	switch (sortBy) {
		case "availability_bands": {
			const slotStartsByBoatId = options?.slotStartsByBoatId;
			if (!slotStartsByBoatId) {
				results.sort(
					(a, b) => b.boat.createdAt.getTime() - a.boat.createdAt.getTime()
				);
				break;
			}

			const ordered = sortByAvailabilityBands({
				results,
				slotStartsByBoatId,
				now: options?.now,
			});
			results.splice(0, results.length, ...ordered);
			break;
		}
		case "price_asc":
			results.sort(
				(a, b) =>
					a.pricingQuote.estimatedTotalPriceCents -
					b.pricingQuote.estimatedTotalPriceCents
			);
			break;
		case "price_desc":
			results.sort(
				(a, b) =>
					b.pricingQuote.estimatedTotalPriceCents -
					a.pricingQuote.estimatedTotalPriceCents
			);
			break;
		case "capacity_desc":
			results.sort(
				(a, b) => b.boat.passengerCapacity - a.boat.passengerCapacity
			);
			break;
		default:
			results.sort(
				(a, b) => b.boat.createdAt.getTime() - a.boat.createdAt.getTime()
			);
	}
};

const prepareAvailabilityBandSortArtifacts = async (params: {
	resultsWithAvailability: AvailabilityResult[];
	durationMinutes: number;
	now: Date;
	passengers: number;
	minDurationRulesByBoatId: Map<string, MinimumDurationRule[]>;
}) => {
	const busyByBoatIdForSlots = await fetchBusyIntervalsForBoats(
		params.resultsWithAvailability
	);
	const slotStartsByBoatId = new Map<string, Date[]>();
	for (const result of params.resultsWithAvailability) {
		const busyIntervals = busyByBoatIdForSlots.get(result.boat.id) ?? [];
		const slots = enrichBoatWithSlots(
			result,
			busyIntervals,
			result.windowStartsAt,
			params.durationMinutes,
			params.now,
			params.passengers,
			params.minDurationRulesByBoatId.get(result.boat.id) ?? []
		);
		slotStartsByBoatId.set(
			result.boat.id,
			slots.map((slot) => slot.startsAt)
		);
	}

	return { busyByBoatIdForSlots, slotStartsByBoatId };
};

const sortAvailabilityResultsForPublicRequest = async (params: {
	resultsWithAvailability: AvailabilityResult[];
	sortBy: string | undefined;
	durationMinutes: number;
	now: Date;
	passengers: number;
	minDurationRulesByBoatId: Map<string, MinimumDurationRule[]>;
}) => {
	if (params.sortBy !== "availability_bands") {
		sortAvailabilityResults(params.resultsWithAvailability, params.sortBy);
		return {
			busyByBoatIdForSlots: undefined,
		};
	}

	const artifacts = await prepareAvailabilityBandSortArtifacts({
		resultsWithAvailability: params.resultsWithAvailability,
		durationMinutes: params.durationMinutes,
		now: params.now,
		passengers: params.passengers,
		minDurationRulesByBoatId: params.minDurationRulesByBoatId,
	});

	sortAvailabilityResults(params.resultsWithAvailability, params.sortBy, {
		slotStartsByBoatId: artifacts.slotStartsByBoatId,
		now: params.now,
	});

	return artifacts;
};

const buildAvailabilityItems = async (params: {
	paged: AvailabilityResult[];
	durationMinutes: number;
	now: Date;
	passengers: number;
	withSlots: boolean;
	preloadedBusyByBoatId?: Map<string, BusyInterval[]>;
	minDurationRulesByBoatId: Map<string, MinimumDurationRule[]>;
}): Promise<PublicAvailabilityItem[]> => {
	if (!params.withSlots) {
		return params.paged.map((result) => ({
			boat: result.boat,
			pricingQuote: result.pricingQuote,
			available: result.available,
		}));
	}

	const busyByBoatId =
		params.preloadedBusyByBoatId ??
		(await fetchBusyIntervalsForBoats(params.paged));

	return params.paged.map((result) => {
		const busyIntervals = busyByBoatId.get(result.boat.id) ?? [];
		const slots = enrichBoatWithSlots(
			result,
			busyIntervals,
			result.windowStartsAt,
			params.durationMinutes,
			params.now,
			params.passengers,
			params.minDurationRulesByBoatId.get(result.boat.id) ?? []
		);
		return {
			boat: result.boat,
			pricingQuote: result.pricingQuote,
			available: result.available,
			slots,
		};
	});
};

const buildAvailableFilters = (params: {
	resultsWithAvailability: AvailabilityResult[];
	items: PublicAvailabilityItem[];
	withSlots: boolean;
}) => {
	const passengerSet = new Set<number>();
	for (const result of params.resultsWithAvailability) {
		passengerSet.add(result.boat.passengerCapacity);
	}
	const passengerOptions = [...passengerSet].sort((a, b) => a - b);

	const allStartTimes = new Set<string>();
	if (params.withSlots) {
		for (const item of params.items) {
			if (item.slots) {
				for (const slot of item.slots) {
					allStartTimes.add(slot.startsAt.toISOString());
				}
			}
		}
	}

	const minBoatMinimumHours = params.resultsWithAvailability.reduce(
		(min, r) => Math.min(min, r.boat.minimumHours),
		Number.POSITIVE_INFINITY
	);
	const durationOptions = buildDurationOptions({
		boatMinimumHours: Number.isFinite(minBoatMinimumHours)
			? minBoatMinimumHours
			: 0,
		minimumDurationRules: [],
	});

	return {
		availableStartTimes: [...allStartTimes].sort(),
		passengerOptions,
		durationOptions,
	};
};

const buildPricingLookups = (
	pricingProfiles: (typeof boatPricingProfile.$inferSelect)[],
	pricingRulesRows: (typeof boatPricingRule.$inferSelect)[]
) => {
	const pricingProfilesByBoatId = new Map<
		string,
		(typeof boatPricingProfile.$inferSelect)[]
	>();
	for (const profile of pricingProfiles) {
		const existing = pricingProfilesByBoatId.get(profile.boatId);
		if (existing) {
			existing.push(profile);
		} else {
			pricingProfilesByBoatId.set(profile.boatId, [profile]);
		}
	}
	for (const profiles of pricingProfilesByBoatId.values()) {
		profiles.sort(
			(a, b) =>
				Number(b.isDefault) - Number(a.isDefault) ||
				b.validFrom.getTime() - a.validFrom.getTime()
		);
	}

	const pricingRulesByBoatId = new Map<string, BoatPricingRule[]>();
	for (const rule of pricingRulesRows) {
		const existing = pricingRulesByBoatId.get(rule.boatId);
		if (existing) {
			existing.push(rule);
		} else {
			pricingRulesByBoatId.set(rule.boatId, [rule]);
		}
	}

	return { pricingProfilesByBoatId, pricingRulesByBoatId };
};

const buildAvailabilityWhereClause = (input: {
	organizationId?: string;
	dockId?: string;
	boatId?: string;
	boatType?: BoatType;
	passengers: number;
	search?: string;
	amenityKeys?: string[];
}) => {
	const amenityKeys =
		input.amenityKeys && input.amenityKeys.length > 0
			? Array.from(new Set(input.amenityKeys))
			: undefined;

	return and(
		eq(boat.status, "active"),
		eq(boat.isActive, true),
		isNull(boat.archivedAt),
		input.organizationId
			? eq(boat.organizationId, input.organizationId)
			: undefined,
		input.dockId ? eq(boat.dockId, input.dockId) : undefined,
		input.boatId ? eq(boat.id, input.boatId) : undefined,
		input.boatType ? eq(boat.type, input.boatType) : undefined,
		gte(boat.passengerCapacity, input.passengers),
		input.search
			? sql`(lower(${boat.name}) like ${`%${input.search.toLowerCase()}%`} or lower(${boat.slug}) like ${`%${input.search.toLowerCase()}%`})`
			: undefined,
		amenityKeys
			? sql`(
					select count(*)
					from ${boatAmenity}
					where ${boatAmenity.boatId} = ${boat.id}
						and ${boatAmenity.isEnabled} = 1
						and ${boatAmenity.key} in (${sql.join(
							amenityKeys.map((key) => sql`${key}`),
							sql`, `
						)})
				) = ${amenityKeys.length}`
			: undefined
	);
};

export const publicBookingRouter = {
	availabilityPublic: publicProcedure
		.route({
			summary: "Search public boat availability",
			description:
				"Search for available boats in a time range with pricing quotes, amenity filters, and sorting.",
		})
		.input(listPublicBoatAvailabilityInputSchema)
		.output(availabilityPublicOutputSchema)
		.handler(async ({ input }) => {
			const mode = resolveAvailabilitySearchMode(input);
			const broadWindow = resolveBroadAvailabilityWindow({ input, mode });
			const where = buildAvailabilityWhereClause(input);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const fetchLimit = input.offset + input.limit;
			const candidateBoats = await db
				.select()
				.from(boat)
				.where(where)
				.orderBy(desc(boat.createdAt))
				.limit(fetchLimit + 100);

			if (candidateBoats.length === 0) {
				return { items: [], total: 0, amenityCounts: {} };
			}

			const candidateBoatIds = candidateBoats.map(
				(candidateBoat) => candidateBoat.id
			);

			const [
				overlappingBookings,
				overlappingBlocks,
				pricingProfiles,
				pricingRulesRows,
				amenityCountRows,
				minDurationRulesRows,
			] = await Promise.all([
				db
					.select({
						boatId: booking.boatId,
						startsAt: booking.startsAt,
						endsAt: booking.endsAt,
					})
					.from(booking)
					.where(
						and(
							inArray(booking.boatId, candidateBoatIds),
							inArray(booking.status, blockingBookingStatuses),
							lt(booking.startsAt, broadWindow.endsAt),
							gt(booking.endsAt, broadWindow.startsAt)
						)
					),
				db
					.select({
						boatId: boatAvailabilityBlock.boatId,
						startsAt: boatAvailabilityBlock.startsAt,
						endsAt: boatAvailabilityBlock.endsAt,
					})
					.from(boatAvailabilityBlock)
					.where(
						and(
							inArray(boatAvailabilityBlock.boatId, candidateBoatIds),
							eq(boatAvailabilityBlock.isActive, true),
							lt(boatAvailabilityBlock.startsAt, broadWindow.endsAt),
							gt(boatAvailabilityBlock.endsAt, broadWindow.startsAt)
						)
					),
				db
					.select()
					.from(boatPricingProfile)
					.where(
						and(
							inArray(boatPricingProfile.boatId, candidateBoatIds),
							isNull(boatPricingProfile.archivedAt)
						)
					)
					.orderBy(
						asc(boatPricingProfile.boatId),
						desc(boatPricingProfile.isDefault),
						desc(boatPricingProfile.validFrom)
					),
				db
					.select()
					.from(boatPricingRule)
					.where(
						and(
							inArray(boatPricingRule.boatId, candidateBoatIds),
							eq(boatPricingRule.isActive, true)
						)
					),
				db
					.select({
						key: boatAmenity.key,
						count: countDistinct(boatAmenity.boatId),
					})
					.from(boatAmenity)
					.where(
						and(
							inArray(boatAmenity.boatId, candidateBoatIds),
							eq(boatAmenity.isEnabled, true)
						)
					)
					.groupBy(boatAmenity.key),
				db
					.select()
					.from(boatMinimumDurationRule)
					.where(
						and(
							inArray(boatMinimumDurationRule.boatId, candidateBoatIds),
							eq(boatMinimumDurationRule.isActive, true)
						)
					),
			]);

			const amenityCounts = buildAmenityCounts(amenityCountRows);

			const bookingBusyByBoatId =
				buildBusyIntervalsByBoatId(overlappingBookings);
			const blockBusyByBoatId = buildBusyIntervalsByBoatId(overlappingBlocks);
			const { pricingProfilesByBoatId, pricingRulesByBoatId } =
				buildPricingLookups(pricingProfiles, pricingRulesRows);

			const minDurationRulesByBoatId = new Map<string, MinimumDurationRule[]>();
			for (const rule of minDurationRulesRows) {
				const existing = minDurationRulesByBoatId.get(rule.boatId);
				if (existing) {
					existing.push(rule);
				} else {
					minDurationRulesByBoatId.set(rule.boatId, [rule]);
				}
			}

			const resultsWithAvailability = scoreCandidateBoats({
				candidateBoats,
				input,
				mode,
				bookingBusyByBoatId,
				blockBusyByBoatId,
				minDurationRulesByBoatId,
				pricingProfilesByBoatId,
				pricingRulesByBoatId,
			});

			const durationMinutes = resolveAvailabilityDurationMinutes({
				mode,
				input,
			});
			const now = new Date();
			const { busyByBoatIdForSlots } =
				await sortAvailabilityResultsForPublicRequest({
					resultsWithAvailability,
					sortBy: input.sortBy,
					durationMinutes,
					now,
					passengers: input.passengers,
					minDurationRulesByBoatId,
				});

			const total = resultsWithAvailability.length;
			const paged = resultsWithAvailability.slice(
				input.offset,
				input.offset + input.limit
			);

			const items = await buildAvailabilityItems({
				paged,
				durationMinutes,
				now,
				passengers: input.passengers,
				withSlots: input.withSlots,
				preloadedBusyByBoatId: busyByBoatIdForSlots,
				minDurationRulesByBoatId,
			});

			const availableFilters = buildAvailableFilters({
				resultsWithAvailability,
				items,
				withSlots: input.withSlots,
			});

			return { items, total, amenityCounts, availableFilters };
		}),

	getByIdPublic: publicProcedure
		.route({
			summary: "Get public boat detail by ID",
			description:
				"Fetch a single boat with dock, amenities, gallery, pricing, and available time slots for a date.",
		})
		.input(getBoatByIdPublicInputSchema)
		.output(getBoatByIdPublicOutputSchema)
		.handler(async ({ input }) => {
			const [foundBoat] = await db
				.select()
				.from(boat)
				.where(
					and(
						eq(boat.id, input.boatId),
						input.includeInactive ? undefined : eq(boat.status, "active"),
						input.includeInactive ? undefined : eq(boat.isActive, true),
						input.includeInactive ? undefined : isNull(boat.archivedAt)
					)
				)
				.limit(1);

			if (!foundBoat) {
				throw new ORPCError("NOT_FOUND");
			}

			const now = new Date();
			const dateStr =
				input.date ?? getDateStringInTimeZone(now, foundBoat.timezone);
			const durationMinutes = Math.max(
				30,
				Math.round(input.durationHours * 60)
			);
			const { dayStart } = resolveWorkingWindow({
				date: dateStr,
				workingHoursStart: foundBoat.workingHoursStart,
				workingHoursEnd: foundBoat.workingHoursEnd,
				timezone: foundBoat.timezone,
			});

			const [
				amenityRows,
				galleryRows,
				dockRows,
				pricingProfiles,
				pricingRulesRows,
				minDurationRulesRows,
				slotBookings,
				availabilityBlockRows,
			] = await Promise.all([
				db
					.select()
					.from(boatAmenity)
					.where(
						and(
							eq(boatAmenity.boatId, foundBoat.id),
							eq(boatAmenity.isEnabled, true)
						)
					),
				db
					.select()
					.from(boatAsset)
					.where(
						and(
							eq(boatAsset.boatId, foundBoat.id),
							eq(boatAsset.purpose, "gallery")
						)
					)
					.orderBy(asc(boatAsset.sortOrder)),
				foundBoat.dockId
					? db
							.select()
							.from(boatDock)
							.where(eq(boatDock.id, foundBoat.dockId))
							.limit(1)
					: Promise.resolve([]),
				db
					.select()
					.from(boatPricingProfile)
					.where(
						and(
							eq(boatPricingProfile.boatId, foundBoat.id),
							isNull(boatPricingProfile.archivedAt),
							lte(boatPricingProfile.validFrom, dayStart),
							or(
								isNull(boatPricingProfile.validTo),
								gt(boatPricingProfile.validTo, dayStart)
							)
						)
					)
					.orderBy(
						desc(boatPricingProfile.isDefault),
						desc(boatPricingProfile.validFrom)
					)
					.limit(1),
				db
					.select()
					.from(boatPricingRule)
					.where(
						and(
							eq(boatPricingRule.boatId, foundBoat.id),
							eq(boatPricingRule.isActive, true)
						)
					),
				db
					.select()
					.from(boatMinimumDurationRule)
					.where(
						and(
							eq(boatMinimumDurationRule.boatId, foundBoat.id),
							eq(boatMinimumDurationRule.isActive, true)
						)
					),
				db
					.select({
						startsAt: booking.startsAt,
						endsAt: booking.endsAt,
					})
					.from(booking)
					.where(
						and(
							eq(booking.boatId, foundBoat.id),
							inArray(booking.status, blockingBookingStatuses)
						)
					),
				db
					.select()
					.from(boatAvailabilityBlock)
					.where(
						and(
							eq(boatAvailabilityBlock.boatId, foundBoat.id),
							eq(boatAvailabilityBlock.isActive, true)
						)
					)
					.orderBy(
						asc(boatAvailabilityBlock.startsAt),
						asc(boatAvailabilityBlock.endsAt)
					),
			]);

			const activePricingProfile = pricingProfiles[0] ?? null;
			const dock = dockRows[0] ?? null;

			const activeRules = activePricingProfile
				? pricingRulesRows.filter(
						(rule) =>
							!rule.pricingProfileId ||
							rule.pricingProfileId === activePricingProfile.id
					)
				: [];

			let pricingQuote: ReturnType<typeof buildBookingPricingQuote> | null =
				null;

			if (activePricingProfile) {
				const { estimatedHours, subtotalCents } =
					estimateBookingSubtotalCentsFromProfile({
						startsAt: dayStart,
						endsAt: new Date(dayStart.getTime() + durationMinutes * 60_000),
						boatMinimumHours: foundBoat.minimumHours,
						passengers: input.passengers,
						timeZone: foundBoat.timezone,
						profile: activePricingProfile,
						pricingRules: activeRules,
					});
				pricingQuote = buildBookingPricingQuote({
					profile: activePricingProfile,
					estimatedHours,
					subtotalCents,
				});
			}

			const busyIntervals: BusyInterval[] = [
				...slotBookings.map((b) => ({
					startsAt: b.startsAt,
					endsAt: b.endsAt,
				})),
				...availabilityBlockRows.map((b) => ({
					startsAt: b.startsAt,
					endsAt: b.endsAt,
				})),
			];

			let slots: ReturnType<typeof enrichSlotsWithPricing> = [];

			if (activePricingProfile) {
				const rawSlots = computeBoatDaySlots({
					date: dateStr,
					boat: {
						workingHoursStart: foundBoat.workingHoursStart,
						workingHoursEnd: foundBoat.workingHoursEnd,
						timezone: foundBoat.timezone,
						minimumHours: foundBoat.minimumHours,
					},
					busyIntervals,
					durationMinutes,
				});
				const afterNotice = filterSlotsAfterMinNotice(
					rawSlots,
					now,
					foundBoat.minimumNoticeMinutes
				);
				const annotated = annotateSlotMinimumDuration({
					slots: afterNotice,
					minimumDurationRules: minDurationRulesRows,
					boatMinimumHours: foundBoat.minimumHours,
					timezone: foundBoat.timezone,
				});
				slots = enrichSlotsWithPricing({
					slots: annotated,
					boatMinimumHours: foundBoat.minimumHours,
					passengers: input.passengers,
					timezone: foundBoat.timezone,
					profile: activePricingProfile,
					pricingRules: activeRules,
				});
			}

			const allStartTimes = slots.map((s) => s.startsAt.toISOString());
			const durationOptions = buildDurationOptions({
				minimumDurationRules: minDurationRulesRows,
				boatMinimumHours: foundBoat.minimumHours,
			});

			return {
				boat: foundBoat,
				dock,
				amenities: amenityRows,
				galleryAssets: galleryRows,
				pricingQuote,
				pricingRules: activeRules,
				availabilityBlocks: availabilityBlockRows,
				minimumDurationRules: minDurationRulesRows,
				slots,
				availableFilters: {
					availableStartTimes: allStartTimes,
					passengerOptions: [foundBoat.passengerCapacity],
					durationOptions,
				},
			};
		}),

	quotePublic: publicProcedure
		.route({
			summary: "Get a public booking quote",
			description:
				"Calculate pricing for a specific boat, time range, and optional discount code.",
		})
		.input(getPublicBookingQuoteInputSchema)
		.output(quotePublicOutputSchema)
		.handler(async ({ context, input }) => {
			const quote = await resolvePublicBookingQuote({
				context,
				input,
			});

			return {
				boat: quote.publicBoat,
				pricingQuote: quote.pricingQuote,
				pricingQuoteAfterDiscount: quote.pricingQuoteAfterDiscount,
				discount: quote.resolvedDiscount
					? {
							code: quote.resolvedDiscount.normalizedDiscountCode,
							discountType: quote.resolvedDiscount.discountType,
							discountValue: quote.resolvedDiscount.discountValue,
							discountAmountCents: quote.resolvedDiscount.discountAmountCents,
						}
					: null,
				estimatedTotalAfterDiscountCents:
					quote.estimatedTotalAfterDiscountCents,
				estimatedPayNowAfterDiscountCents:
					quote.estimatedPayNowAfterDiscountCents,
				estimatedPayLaterAfterDiscountCents:
					quote.estimatedPayLaterAfterDiscountCents,
			};
		}),

	createPublic: publicProcedure
		.route({
			summary: "Create a public booking",
			description:
				"Book a boat as a public user. Validates availability, calculates pricing, and syncs calendar.",
		})
		.input(createPublicBookingInputSchema)
		.output(createPublicBookingOutputSchema)
		.handler(async ({ context, input }) => {
			const quote = await resolvePublicBookingQuote({
				context,
				input,
			});

			const managedLikeInput: CreateManagedBookingInput = {
				boatId: quote.publicBoat.id,
				customerUserId: quote.sessionUserId,
				source: input.source,
				status: "pending",
				paymentStatus: "unpaid",
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				passengers: input.passengers,
				contactName: input.contactName,
				contactPhone: input.contactPhone,
				contactEmail: input.contactEmail,
				timezone: input.timezone,
				basePriceCents: quote.pricingQuote.estimatedBasePriceCents,
				currency: quote.pricingQuote.currency,
				calendarLink: quote.calendarLink,
				discountCode: input.discountCode,
				notes: input.notes,
				specialRequests: input.specialRequests,
				externalRef: input.externalRef,
				metadata: input.metadata,
			};

			const created = await createManagedBookingRecord({
				input: managedLikeInput,
				organizationId: quote.publicBoat.organizationId,
				sessionUserId: quote.sessionUserId,
				boatName: quote.publicBoat.name,
				resolvedDiscount: quote.resolvedDiscount,
				calendarLink: quote.calendarLink,
				totalPriceCentsOverride:
					quote.pricingQuoteAfterDiscount.estimatedTotalPriceCents,
			});

			try {
				const referral = await resolveAffiliateReferralFromContext(context);
				if (
					referral &&
					(referral.organizationId === null ||
						referral.organizationId === quote.publicBoat.organizationId)
				) {
					await attachAffiliateAttributionToBooking({
						bookingId: created.booking.id,
						organizationId: created.booking.organizationId,
						currency: quote.pricingQuoteAfterDiscount.currency,
						referral,
						commissionAmountCents:
							quote.pricingQuoteAfterDiscount.estimatedAffiliateFeeCents,
						metadata: JSON.stringify({
							requestUrl: context.requestUrl,
							capturedFrom: "cookie",
						}),
					});
				}
			} catch (error) {
				console.error(
					"Failed to attach affiliate attribution to public booking",
					error
				);
			}

			try {
				const recipients = buildRecipients({
					userIds: [quote.sessionUserId],
					title: "Booking created",
					body: `${quote.publicBoat.name}: ${created.booking.startsAt.toISOString()} - ${created.booking.endsAt.toISOString()}`,
					ctaUrl: `/bookings`,
					metadata: { bookingId: created.booking.id },
				});
				if (recipients.length > 0) {
					await notificationsPusher({
						input: {
							organizationId: created.booking.organizationId,
							actorUserId: quote.sessionUserId ?? undefined,
							eventType: "booking.created",
							sourceType: "booking",
							sourceId: created.booking.id,
							idempotencyKey: `booking.created:${created.booking.id}`,
							payload: { recipients },
						},
						queue: context.notificationQueue,
					});
				}
			} catch (error) {
				console.error("Failed to emit booking.created event", error);
			}

			await enqueueBookingExpirationCheck(
				created.booking.id,
				context.notificationQueue
			);

			return {
				...created,
				pricingQuote: quote.pricingQuote,
				pricingQuoteAfterDiscount: quote.pricingQuoteAfterDiscount,
				estimatedTotalAfterDiscountCents:
					quote.estimatedTotalAfterDiscountCents,
				estimatedPayNowAfterDiscountCents:
					quote.estimatedPayNowAfterDiscountCents,
				estimatedPayLaterAfterDiscountCents:
					quote.estimatedPayLaterAfterDiscountCents,
			};
		}),

	checkoutReadModelPublic: publicProcedure
		.route({
			summary: "Get public checkout read model",
			description:
				"Build a checkout-focused read model with fee line items, payment split, policy summaries, and localized labels.",
		})
		.input(getPublicCheckoutReadModelInputSchema)
		.output(checkoutReadModelPublicOutputSchema)
		.handler(async ({ context, input }) => {
			const quote = await resolvePublicBookingQuote({
				context,
				input: {
					boatId: input.boatId,
					startsAt: input.startsAt,
					endsAt: input.endsAt,
					passengers: input.passengers,
					discountCode: input.discountCode,
				},
			});

			const readModel = buildCheckoutReadModel({
				boat: quote.publicBoat,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				passengers: input.passengers,
				locale: input.locale,
				pricingQuote: quote.pricingQuote,
				pricingQuoteAfterDiscount: quote.pricingQuoteAfterDiscount,
				discount: quote.resolvedDiscount
					? {
							normalizedDiscountCode:
								quote.resolvedDiscount.normalizedDiscountCode,
							discountType: quote.resolvedDiscount.discountType,
							discountValue: quote.resolvedDiscount.discountValue,
							discountAmountCents: quote.resolvedDiscount.discountAmountCents,
						}
					: null,
			});

			return {
				boat: quote.publicBoat,
				pricingQuote: quote.pricingQuote,
				pricingQuoteAfterDiscount: quote.pricingQuoteAfterDiscount,
				discount: quote.resolvedDiscount
					? {
							code: quote.resolvedDiscount.normalizedDiscountCode,
							discountType: quote.resolvedDiscount.discountType,
							discountValue: quote.resolvedDiscount.discountValue,
							discountAmountCents: quote.resolvedDiscount.discountAmountCents,
						}
					: null,
				lineItems: readModel.lineItems,
				policies: readModel.policies,
				totals: readModel.totals,
				itinerary: readModel.itinerary,
			};
		}),
};
