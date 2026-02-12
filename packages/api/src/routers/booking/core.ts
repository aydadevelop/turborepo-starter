import { db } from "@full-stack-cf-app/db";
import {
	type BoatType,
	boat,
	boatAmenity,
	boatAsset,
	boatAvailabilityBlock,
	boatCalendarConnection,
	boatDock,
	boatPricingProfile,
	boatPricingRule,
} from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingDiscountApplication,
	bookingDiscountCode,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	countDistinct,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lt,
	lte,
	ne,
	or,
	sql,
} from "drizzle-orm";
import {
	type BoatPricingRule,
	buildBookingPricingQuote,
	estimateBookingSubtotalCentsFromProfile,
} from "../../booking/pricing";
import {
	type BusyInterval,
	computeBoatDaySlots,
	enrichSlotsWithPricing,
	filterSlotsAfterMinNotice,
	resolveWorkingWindow,
} from "../../booking/slots";
import { getCalendarAdapter } from "../../calendar/adapters/registry";
import { organizationPermissionProcedure, publicProcedure } from "../../index";
import {
	availabilityPublicOutputSchema,
	cancelManagedBookingInputSchema,
	createManagedBookingInputSchema,
	createManagedBookingOutputSchema,
	createPublicBookingInputSchema,
	createPublicBookingOutputSchema,
	getBoatByIdPublicInputSchema,
	getBoatByIdPublicOutputSchema,
	getManagedBookingInputSchema,
	getManagedBookingOutputSchema,
	getPublicBookingQuoteInputSchema,
	listManagedBookingsInputSchema,
	listManagedBookingsOutputSchema,
	listPublicBoatAvailabilityInputSchema,
	quotePublicOutputSchema,
} from "../booking.schemas";
import { successOutputSchema } from "../shared/schema-utils";
import {
	cancelBookingAndSync,
	ensureNoExternalCalendarOverlap,
	syncCalendarLinkOnBookingCreate,
} from "./calendar-sync";
import { resolveBookingDiscount } from "./discount-resolution";
import {
	blockingBookingStatuses,
	type CreateManagedBookingCalendarLinkInput,
	type CreateManagedBookingInput,
	type ResolvedBookingDiscount,
	requireActiveMembership,
	requireManagedBoat,
	requireManagedBooking,
	requireManagedCalendarConnection,
	requireSessionUserId,
} from "./helpers";
import {
	emitBookingCancelledNotificationEvent,
	emitBookingCreatedNotificationEvent,
} from "./notification-events";

const getSqliteErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "";
};

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

const ensureNoBookingOverlap = async (params: {
	organizationId: string;
	boatId: string;
	startsAt: Date;
	endsAt: Date;
}) => {
	const [overlappingBooking] = await db
		.select({ id: booking.id })
		.from(booking)
		.where(
			and(
				eq(booking.organizationId, params.organizationId),
				eq(booking.boatId, params.boatId),
				inArray(booking.status, blockingBookingStatuses),
				lt(booking.startsAt, params.endsAt),
				gt(booking.endsAt, params.startsAt)
			)
		)
		.limit(1);

	if (overlappingBooking) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat is already booked for the selected time range",
		});
	}
};

const ensureNoAvailabilityBlockOverlap = async (params: {
	boatId: string;
	startsAt: Date;
	endsAt: Date;
}) => {
	const [overlappingBlock] = await db
		.select({ id: boatAvailabilityBlock.id })
		.from(boatAvailabilityBlock)
		.where(
			and(
				eq(boatAvailabilityBlock.boatId, params.boatId),
				eq(boatAvailabilityBlock.isActive, true),
				lt(boatAvailabilityBlock.startsAt, params.endsAt),
				gt(boatAvailabilityBlock.endsAt, params.startsAt)
			)
		)
		.limit(1);

	if (overlappingBlock) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat is unavailable for the selected time range",
		});
	}
};

const resolveActivePricingProfile = async (params: {
	boatId: string;
	startsAt: Date;
}) => {
	const [activeProfile] = await db
		.select()
		.from(boatPricingProfile)
		.where(
			and(
				eq(boatPricingProfile.boatId, params.boatId),
				isNull(boatPricingProfile.archivedAt),
				lte(boatPricingProfile.validFrom, params.startsAt),
				or(
					isNull(boatPricingProfile.validTo),
					gt(boatPricingProfile.validTo, params.startsAt)
				)
			)
		)
		.orderBy(
			desc(boatPricingProfile.isDefault),
			desc(boatPricingProfile.validFrom)
		)
		.limit(1);

	if (!activeProfile) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Boat has no active pricing profile",
		});
	}

	return activeProfile;
};

const resolvePrimaryCalendarLinkInput = async (params: {
	boatId: string;
}): Promise<CreateManagedBookingCalendarLinkInput> => {
	const [primaryConnection] = await db
		.select()
		.from(boatCalendarConnection)
		.where(
			and(
				eq(boatCalendarConnection.boatId, params.boatId),
				eq(boatCalendarConnection.isPrimary, true),
				ne(boatCalendarConnection.syncStatus, "disabled")
			)
		)
		.limit(1);

	if (primaryConnection) {
		const adapter = getCalendarAdapter(primaryConnection.provider);
		if (!adapter) {
			return {
				boatCalendarConnectionId: undefined,
				provider: "manual",
				externalCalendarId: undefined,
				externalEventId: `booking-${crypto.randomUUID()}`,
				iCalUid: undefined,
				externalEventVersion: undefined,
				syncedAt: undefined,
			};
		}

		return {
			boatCalendarConnectionId: primaryConnection.id,
			provider: primaryConnection.provider,
			externalCalendarId: primaryConnection.externalCalendarId,
			externalEventId: `booking-${crypto.randomUUID()}`,
			iCalUid: undefined,
			externalEventVersion: undefined,
			syncedAt: undefined,
		};
	}

	return {
		boatCalendarConnectionId: undefined,
		provider: "manual",
		externalCalendarId: undefined,
		externalEventId: `booking-${crypto.randomUUID()}`,
		iCalUid: undefined,
		externalEventVersion: undefined,
		syncedAt: undefined,
	};
};

const createManagedBookingRecord = async (params: {
	input: CreateManagedBookingInput;
	organizationId: string;
	sessionUserId?: string;
	boatName: string;
	resolvedDiscount: ResolvedBookingDiscount | null;
	calendarLink: CreateManagedBookingCalendarLinkInput;
	totalPriceCentsOverride?: number;
}) => {
	const bookingId = crypto.randomUUID();
	const discountAmountCents = params.resolvedDiscount?.discountAmountCents ?? 0;
	const fallbackTotalPriceCents = Math.max(
		params.input.basePriceCents - discountAmountCents,
		0
	);
	const totalPriceCents =
		params.totalPriceCentsOverride !== undefined
			? Math.max(params.totalPriceCentsOverride, 0)
			: fallbackTotalPriceCents;
	try {
		await db.insert(booking).values({
			id: bookingId,
			organizationId: params.organizationId,
			boatId: params.input.boatId,
			customerUserId: params.input.customerUserId,
			createdByUserId: params.sessionUserId,
			source: params.input.source,
			status: params.input.status,
			paymentStatus: params.input.paymentStatus,
			calendarSyncStatus: "pending",
			startsAt: params.input.startsAt,
			endsAt: params.input.endsAt,
			passengers: params.input.passengers,
			contactName: params.input.contactName,
			contactPhone: params.input.contactPhone,
			contactEmail: params.input.contactEmail,
			timezone: params.input.timezone,
			basePriceCents: params.input.basePriceCents,
			discountAmountCents,
			totalPriceCents,
			currency: params.input.currency.toUpperCase(),
			notes: params.input.notes,
			specialRequests: params.input.specialRequests,
			externalRef: params.input.externalRef,
			metadata: params.input.metadata,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch (error) {
		const message = getSqliteErrorMessage(error);
		if (message.includes("BOOKING_OVERLAP")) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Boat is already booked for the selected time range",
			});
		}
		if (message.includes("BOOKING_INVALID_RANGE")) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Booking start must be before end",
			});
		}
		throw error;
	}

	try {
		await db.insert(bookingCalendarLink).values({
			id: crypto.randomUUID(),
			bookingId,
			boatCalendarConnectionId: params.calendarLink.boatCalendarConnectionId,
			provider: params.calendarLink.provider,
			externalCalendarId: params.calendarLink.externalCalendarId,
			externalEventId: params.calendarLink.externalEventId,
			iCalUid: params.calendarLink.iCalUid,
			externalEventVersion: params.calendarLink.externalEventVersion,
			syncedAt: params.calendarLink.syncedAt,
			syncError: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch {
		await db.delete(booking).where(eq(booking.id, bookingId));
		throw new ORPCError("BAD_REQUEST", {
			message: "Failed to attach calendar link for booking",
		});
	}

	const calendarSyncResult = await syncCalendarLinkOnBookingCreate({
		bookingId,
		organizationId: params.organizationId,
		boatId: params.input.boatId,
		boatName: params.boatName,
		source: params.input.source,
		startsAt: params.input.startsAt,
		endsAt: params.input.endsAt,
		timezone: params.input.timezone,
		contactName: params.input.contactName,
		notes: params.input.notes,
		calendarLink: params.calendarLink,
	});

	await db
		.update(booking)
		.set({
			calendarSyncStatus: calendarSyncResult.status,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, bookingId));

	await db
		.update(bookingCalendarLink)
		.set({
			...calendarSyncResult.calendarLinkUpdate,
			updatedAt: new Date(),
		})
		.where(eq(bookingCalendarLink.bookingId, bookingId));

	let createdDiscountApplication:
		| typeof bookingDiscountApplication.$inferSelect
		| null = null;
	if (params.resolvedDiscount) {
		const discountApplicationId = crypto.randomUUID();
		await db.insert(bookingDiscountApplication).values({
			id: discountApplicationId,
			bookingId,
			discountCodeId: params.resolvedDiscount.discountCodeId,
			code: params.resolvedDiscount.normalizedDiscountCode,
			discountType: params.resolvedDiscount.discountType,
			discountValue: params.resolvedDiscount.discountValue,
			appliedAmountCents: params.resolvedDiscount.discountAmountCents,
			appliedAt: new Date(),
		});

		await db
			.update(bookingDiscountCode)
			.set({
				usageCount: sql`${bookingDiscountCode.usageCount} + 1`,
				updatedAt: new Date(),
			})
			.where(
				eq(bookingDiscountCode.id, params.resolvedDiscount.discountCodeId)
			);

		const [selectedDiscountApplication] = await db
			.select()
			.from(bookingDiscountApplication)
			.where(eq(bookingDiscountApplication.id, discountApplicationId))
			.limit(1);

		createdDiscountApplication = selectedDiscountApplication ?? null;
	}

	const [createdBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, bookingId))
		.limit(1);

	if (!createdBooking) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	const [createdCalendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);

	return {
		booking: createdBooking,
		calendarLink: createdCalendarLink,
		discountApplication: createdDiscountApplication,
	};
};

const resolvePublicBookingQuote = async (params: {
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

const fetchSlotsForPagedBoats = async (paged: AvailabilityResult[]) => {
	const pagedBoatIds = paged.map((r) => r.boat.id);
	if (pagedBoatIds.length === 0) {
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
					inArray(booking.boatId, pagedBoatIds),
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
					inArray(boatAvailabilityBlock.boatId, pagedBoatIds),
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
	passengers: number
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
	return enrichSlotsWithPricing({
		slots: filtered,
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
	const isUnavailable =
		hasOverlap(bookingBusyIntervals, startsAt, endsAt) ||
		hasOverlap(blockBusyIntervals, startsAt, endsAt);

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

const sortAvailabilityResults = (
	results: AvailabilityResult[],
	sortBy?: string
) => {
	switch (sortBy) {
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

export const coreBookingRouter = {
	availabilityPublic: publicProcedure
		.route({
			tags: ["Booking"],
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
			]);

			const amenityCounts: Record<string, number> = {};
			for (const row of amenityCountRows) {
				amenityCounts[row.key] = Number(row.count);
			}

			const bookingBusyByBoatId =
				buildBusyIntervalsByBoatId(overlappingBookings);
			const blockBusyByBoatId = buildBusyIntervalsByBoatId(overlappingBlocks);
			const { pricingProfilesByBoatId, pricingRulesByBoatId } =
				buildPricingLookups(pricingProfiles, pricingRulesRows);

			const resultsWithAvailability: AvailabilityResult[] = [];
			for (const candidateBoat of candidateBoats) {
				const result = scoreCandidate(
					candidateBoat,
					input,
					mode,
					bookingBusyByBoatId,
					blockBusyByBoatId,
					pricingProfilesByBoatId,
					pricingRulesByBoatId
				);
				if (result) {
					resultsWithAvailability.push(result);
				}
			}

			sortAvailabilityResults(resultsWithAvailability, input.sortBy);

			const total = resultsWithAvailability.length;
			const paged = resultsWithAvailability.slice(
				input.offset,
				input.offset + input.limit
			);

			const durationMinutes =
				mode === "range"
					? Math.max(
							30,
							Math.round(
								((input.endsAt as Date).getTime() -
									(input.startsAt as Date).getTime()) /
									60_000
							)
						)
					: Math.max(30, Math.round((input.durationHours as number) * 60));
			const now = new Date();

			let items: Array<{
				boat: (typeof candidateBoats)[number];
				pricingQuote: ReturnType<typeof buildBookingPricingQuote>;
				available: boolean;
				slots?: ReturnType<typeof enrichSlotsWithPricing>;
			}>;

			if (input.withSlots) {
				const busyByBoatId = await fetchSlotsForPagedBoats(paged);

				items = paged.map((r) => {
					const busyIntervals = busyByBoatId.get(r.boat.id) ?? [];
					const slots = enrichBoatWithSlots(
						r,
						busyIntervals,
						r.windowStartsAt,
						durationMinutes,
						now,
						input.passengers
					);
					return {
						boat: r.boat,
						pricingQuote: r.pricingQuote,
						available: r.available,
						slots,
					};
				});
			} else {
				items = paged.map((r) => ({
					boat: r.boat,
					pricingQuote: r.pricingQuote,
					available: r.available,
				}));
			}

			const passengerSet = new Set<number>();
			for (const r of resultsWithAvailability) {
				passengerSet.add(r.boat.passengerCapacity);
			}
			const passengerOptions = [...passengerSet].sort((a, b) => a - b);

			const allStartTimes = new Set<string>();
			if (input.withSlots) {
				for (const item of items) {
					if (item.slots) {
						for (const slot of item.slots) {
							allStartTimes.add(slot.startsAt.toISOString());
						}
					}
				}
			}

			const durationOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];
			const availableFilters = {
				availableStartTimes: [...allStartTimes].sort(),
				passengerOptions,
				durationOptions,
			};

			return { items, total, amenityCounts, availableFilters };
		}),

	getByIdPublic: publicProcedure
		.route({
			tags: ["Booking"],
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
						eq(boat.status, "active"),
						eq(boat.isActive, true),
						isNull(boat.archivedAt)
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
				slotBookings,
				slotBlocks,
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
					.select({
						startsAt: boatAvailabilityBlock.startsAt,
						endsAt: boatAvailabilityBlock.endsAt,
					})
					.from(boatAvailabilityBlock)
					.where(
						and(
							eq(boatAvailabilityBlock.boatId, foundBoat.id),
							eq(boatAvailabilityBlock.isActive, true)
						)
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
				...slotBlocks.map((b) => ({
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
				const filtered = filterSlotsAfterMinNotice(
					rawSlots,
					now,
					foundBoat.minimumNoticeMinutes
				);
				slots = enrichSlotsWithPricing({
					slots: filtered,
					boatMinimumHours: foundBoat.minimumHours,
					passengers: input.passengers,
					timezone: foundBoat.timezone,
					profile: activePricingProfile,
					pricingRules: activeRules,
				});
			}

			const allStartTimes = slots.map((s) => s.startsAt.toISOString());
			const durationOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];

			return {
				boat: foundBoat,
				dock,
				amenities: amenityRows,
				galleryAssets: galleryRows,
				pricingQuote,
				pricingRules: activeRules,
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
			tags: ["Booking"],
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
			tags: ["Booking"],
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
				await emitBookingCreatedNotificationEvent({
					queue: context.notificationQueue,
					actorUserId: quote.sessionUserId ?? undefined,
					booking: created.booking,
					boatName: quote.publicBoat.name,
					recipientUserIds: [quote.sessionUserId],
				});
			} catch (error) {
				console.error("Failed to emit booking.created event", error);
			}

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

	listManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			tags: ["Booking"],
			summary: "List managed bookings",
			description:
				"List bookings for the active organization with filters, sorting, and pagination.",
		})
		.input(listManagedBookingsInputSchema)
		.output(listManagedBookingsOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = and(
				eq(booking.organizationId, activeMembership.organizationId),
				input.boatId ? eq(booking.boatId, input.boatId) : undefined,
				input.status ? eq(booking.status, input.status) : undefined,
				input.paymentStatus
					? eq(booking.paymentStatus, input.paymentStatus)
					: undefined,
				input.source ? eq(booking.source, input.source) : undefined,
				input.customerUserId
					? eq(booking.customerUserId, input.customerUserId)
					: undefined,
				input.calendarSyncStatus
					? eq(booking.calendarSyncStatus, input.calendarSyncStatus)
					: undefined,
				input.from ? gt(booking.endsAt, input.from) : undefined,
				input.to ? lt(booking.startsAt, input.to) : undefined,
				input.search
					? sql`(lower(${booking.contactName}) like ${`%${input.search.toLowerCase()}%`} or lower(${booking.contactPhone}) like ${`%${input.search.toLowerCase()}%`} or lower(${booking.contactEmail}) like ${`%${input.search.toLowerCase()}%`})`
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const orderDir = input.sortOrder === "asc" ? asc : desc;
			const sortColumnMap = {
				startsAt: booking.startsAt,
				createdAt: booking.createdAt,
				totalPriceCents: booking.totalPriceCents,
			} as const;
			const orderByExpr = orderDir(sortColumnMap[input.sortBy]);

			const [countResult, items] = await Promise.all([
				db.select({ total: count() }).from(booking).where(where),
				db
					.select()
					.from(booking)
					.where(where)
					.orderBy(orderByExpr)
					.limit(input.limit)
					.offset(input.offset),
			]);

			return {
				items,
				total: Number(countResult[0]?.total ?? 0),
			};
		}),

	getManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			tags: ["Booking"],
			summary: "Get managed booking details",
			description:
				"Get a booking with optional discount application and calendar link.",
		})
		.input(getManagedBookingInputSchema)
		.output(getManagedBookingOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);

			const [discountApplication] = input.includeDiscountApplication
				? await db
						.select()
						.from(bookingDiscountApplication)
						.where(eq(bookingDiscountApplication.bookingId, managedBooking.id))
						.limit(1)
				: [undefined];

			const [calendarLink] = input.includeCalendarLink
				? await db
						.select()
						.from(bookingCalendarLink)
						.where(eq(bookingCalendarLink.bookingId, managedBooking.id))
						.limit(1)
				: [undefined];

			return {
				booking: managedBooking,
				calendarLink,
				discountApplication,
			};
		}),

	createManaged: organizationPermissionProcedure({
		booking: ["create"],
	})
		.route({
			tags: ["Booking"],
			summary: "Create a managed booking",
			description:
				"Create a booking as an organization operator with full control over pricing and calendar.",
		})
		.input(createManagedBookingInputSchema)
		.output(createManagedBookingOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBoat = await requireManagedBoat(
				input.boatId,
				activeMembership.organizationId
			);
			if (input.calendarLink.boatCalendarConnectionId) {
				await requireManagedCalendarConnection({
					boatId: input.boatId,
					calendarConnectionId: input.calendarLink.boatCalendarConnectionId,
				});
			}

			await ensureNoBookingOverlap({
				organizationId: activeMembership.organizationId,
				boatId: input.boatId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
			});
			await ensureNoAvailabilityBlockOverlap({
				boatId: input.boatId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
			});

			await ensureNoExternalCalendarOverlap({
				provider: input.calendarLink.provider,
				externalCalendarId: input.calendarLink.externalCalendarId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
			});

			const resolvedDiscount = await resolveBookingDiscount({
				organizationId: activeMembership.organizationId,
				boatId: input.boatId,
				startsAt: input.startsAt,
				basePriceCents: input.basePriceCents,
				discountCode: input.discountCode,
				customerUserId: input.customerUserId,
			});

			const created = await createManagedBookingRecord({
				input,
				organizationId: activeMembership.organizationId,
				sessionUserId,
				boatName: managedBoat.name,
				resolvedDiscount,
				calendarLink: input.calendarLink,
			});
			try {
				await emitBookingCreatedNotificationEvent({
					queue: context.notificationQueue,
					actorUserId: sessionUserId,
					booking: created.booking,
					boatName: managedBoat.name,
					recipientUserIds: [input.customerUserId, sessionUserId],
				});
			} catch (error) {
				console.error("Failed to emit booking.created event", error);
			}

			return created;
		}),

	cancelManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			tags: ["Booking"],
			summary: "Cancel a managed booking",
			description: "Cancel a booking and sync the calendar event deletion.",
		})
		.input(cancelManagedBookingInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);
			const wasAlreadyCancelled = managedBooking.status === "cancelled";

			const cancellationResult = await cancelBookingAndSync({
				managedBooking,
				cancelledByUserId: sessionUserId,
				reason: input.reason,
			});

			if (!wasAlreadyCancelled) {
				const [managedBoat] = await db
					.select({
						name: boat.name,
					})
					.from(boat)
					.where(eq(boat.id, managedBooking.boatId))
					.limit(1);

				try {
					await emitBookingCancelledNotificationEvent({
						queue: context.notificationQueue,
						actorUserId: sessionUserId,
						booking: managedBooking,
						boatName: managedBoat?.name ?? "Boat booking",
						occurredAt: new Date(),
						recipientUserIds: [
							managedBooking.customerUserId,
							managedBooking.createdByUserId,
							sessionUserId,
						],
					});
				} catch (error) {
					console.error("Failed to emit booking.cancelled event", error);
				}
			}

			return cancellationResult;
		}),
};
