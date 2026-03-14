import {
	listingAvailabilityBlock,
	listingAvailabilityException,
	listingAvailabilityRule,
	listingMinimumDurationRule,
} from "@my-app/db/schema/availability";
import {
	booking,
	listing,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import {
	type ResolvedPricingContext,
	resolveDefaultPricingContext,
} from "@my-app/pricing";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { blockingBookingStatuses } from "../overlap";
import type { Db, PublicBookingSurfaceInput } from "../types";
import type {
	AvailabilityExceptionWindow,
	AvailabilityRuleWindow,
	BusyWindow,
	MinimumDurationRuleWindow,
} from "./availability";

export interface PublicSurfaceListingRow {
	id: string;
	minimumDurationMinutes: number;
	minimumNoticeMinutes: number;
	organizationId: string;
	serviceFamily: string;
	timezone: string;
	workingHoursEnd: number;
	workingHoursStart: number;
}

export interface PublicSurfaceQueryState {
	busyWindows: BusyWindow[];
	exception: AvailabilityExceptionWindow | undefined;
	listing: PublicSurfaceListingRow;
	minimumDurationRules: MinimumDurationRuleWindow[];
	pricingContext: ResolvedPricingContext | null;
	rules: AvailabilityRuleWindow[];
}

export const loadPublicBookingSurfaceListing = async (
	listingId: string,
	db: Db,
): Promise<PublicSurfaceListingRow> => {
	const [listingRow] = await db
		.select({
			id: listing.id,
			organizationId: listing.organizationId,
			timezone: listing.timezone,
			serviceFamily: listingTypeConfig.serviceFamily,
			minimumDurationMinutes: listing.minimumDurationMinutes,
			minimumNoticeMinutes: listing.minimumNoticeMinutes,
			workingHoursStart: listing.workingHoursStart,
			workingHoursEnd: listing.workingHoursEnd,
		})
		.from(listing)
		.innerJoin(
			listingPublication,
			and(
				eq(listingPublication.listingId, listing.id),
				eq(listingPublication.isActive, true),
				eq(listingPublication.channelType, "platform_marketplace"),
			),
		)
		.innerJoin(
			listingTypeConfig,
			eq(listingTypeConfig.slug, listing.listingTypeSlug),
		)
		.where(and(eq(listing.id, listingId), eq(listing.isActive, true)))
		.limit(1);

	if (!listingRow) {
		throw new Error("NOT_FOUND");
	}

	if (listingRow.serviceFamily !== "boat_rent") {
		throw new Error("NOT_SUPPORTED");
	}

	return listingRow;
};

export const loadPublicBookingSurfaceState = async (
	input: PublicBookingSurfaceInput & {
		dayStart: Date;
		dayEnd: Date;
		weekday: number;
	},
	listingRow: PublicSurfaceListingRow,
	db: Db,
): Promise<PublicSurfaceQueryState> => {
	const [
		rules,
		exceptions,
		blocks,
		bookings,
		minimumDurationRules,
		pricingContext,
	] = await Promise.all([
		db
			.select({
				startMinute: listingAvailabilityRule.startMinute,
				endMinute: listingAvailabilityRule.endMinute,
			})
			.from(listingAvailabilityRule)
			.where(
				and(
					eq(listingAvailabilityRule.listingId, input.listingId),
					eq(listingAvailabilityRule.dayOfWeek, input.weekday),
					eq(listingAvailabilityRule.isActive, true),
				),
			)
			.orderBy(
				asc(listingAvailabilityRule.startMinute),
				asc(listingAvailabilityRule.endMinute),
			),
		db
			.select({
				isAvailable: listingAvailabilityException.isAvailable,
				startMinute: listingAvailabilityException.startMinute,
				endMinute: listingAvailabilityException.endMinute,
			})
			.from(listingAvailabilityException)
			.where(
				and(
					eq(listingAvailabilityException.listingId, input.listingId),
					eq(listingAvailabilityException.date, input.date),
				),
			)
			.limit(1),
		db
			.select({
				startsAt: listingAvailabilityBlock.startsAt,
				endsAt: listingAvailabilityBlock.endsAt,
				reason: listingAvailabilityBlock.reason,
				source: listingAvailabilityBlock.source,
			})
			.from(listingAvailabilityBlock)
			.where(
				and(
					eq(listingAvailabilityBlock.listingId, input.listingId),
					eq(listingAvailabilityBlock.isActive, true),
					lt(listingAvailabilityBlock.startsAt, input.dayEnd),
					gt(listingAvailabilityBlock.endsAt, input.dayStart),
				),
			),
		db
			.select({
				startsAt: booking.startsAt,
				endsAt: booking.endsAt,
			})
			.from(booking)
			.where(
				and(
					eq(booking.listingId, input.listingId),
					inArray(booking.status, [...blockingBookingStatuses]),
					lt(booking.startsAt, input.dayEnd),
					gt(booking.endsAt, input.dayStart),
				),
			),
		db
			.select({
				daysOfWeek: listingMinimumDurationRule.daysOfWeek,
				endHour: listingMinimumDurationRule.endHour,
				endMinute: listingMinimumDurationRule.endMinute,
				minimumDurationMinutes:
					listingMinimumDurationRule.minimumDurationMinutes,
				startHour: listingMinimumDurationRule.startHour,
				startMinute: listingMinimumDurationRule.startMinute,
			})
			.from(listingMinimumDurationRule)
			.where(
				and(
					eq(listingMinimumDurationRule.listingId, input.listingId),
					eq(listingMinimumDurationRule.isActive, true),
				),
			),
		resolveDefaultPricingContext(input.listingId, db),
	]);

	return {
		listing: listingRow,
		rules,
		exception: exceptions[0],
		busyWindows: [
			...blocks.map((block) => ({
				startsAt: block.startsAt,
				endsAt: block.endsAt,
				source: block.source,
				reason: block.reason,
			})),
			...bookings.map((currentBooking) => ({
				startsAt: currentBooking.startsAt,
				endsAt: currentBooking.endsAt,
				source: "booking" as const,
				reason: "Already booked",
			})),
		],
		minimumDurationRules,
		pricingContext,
	};
};
