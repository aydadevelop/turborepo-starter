import { listingAvailabilityBlock } from "@my-app/db/schema/availability";
import { booking } from "@my-app/db/schema/marketplace";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import type { Db } from "./types";

/** Booking statuses that count as occupying a time slot (block new bookings). */
export const blockingBookingStatuses = [
	"pending",
	"awaiting_payment",
	"confirmed",
	"in_progress",
] as const;

/**
 * Pure overlap check: returns true if two time windows share any period.
 * Uses exclusive-end convention: [startsAt, endsAt).
 */
export const detectOverlap = (
	a: { startsAt: Date; endsAt: Date },
	b: { startsAt: Date; endsAt: Date }
): boolean => a.startsAt < b.endsAt && a.endsAt > b.startsAt;

/**
 * DB-backed overlap check: throws if an active booking exists for the same
 * listing that overlaps [startsAt, endsAt). Optionally excludes one booking
 * (e.g. the booking being shifted).
 */
export const assertNoOverlap = async (
	params: {
		organizationId: string;
		listingId: string;
		startsAt: Date;
		endsAt: Date;
		excludeBookingId?: string;
	},
	db: Db
): Promise<void> => {
	const conditions = [
		eq(booking.organizationId, params.organizationId),
		eq(booking.listingId, params.listingId),
		inArray(booking.status, blockingBookingStatuses),
		lt(booking.startsAt, params.endsAt),
		gt(booking.endsAt, params.startsAt),
	];

	if (params.excludeBookingId) {
		conditions.push(ne(booking.id, params.excludeBookingId));
	}

	const [overlappingBooking] = await db
		.select({ id: booking.id })
		.from(booking)
		.where(and(...conditions))
		.limit(1);

	if (overlappingBooking) {
		throw new Error(
			"BOOKING_OVERLAP: Listing is already booked for the selected time range"
		);
	}
};

/**
 * DB-backed check: throws if an availability block (manual block, maintenance,
 * calendar import) exists for the listing that overlaps [startsAt, endsAt).
 */
export const assertNoAvailabilityBlockOverlap = async (
	params: {
		listingId: string;
		startsAt: Date;
		endsAt: Date;
	},
	db: Db
): Promise<void> => {
	const [overlappingBlock] = await db
		.select({ id: listingAvailabilityBlock.id })
		.from(listingAvailabilityBlock)
		.where(
			and(
				eq(listingAvailabilityBlock.listingId, params.listingId),
				eq(listingAvailabilityBlock.isActive, true),
				lt(listingAvailabilityBlock.startsAt, params.endsAt),
				gt(listingAvailabilityBlock.endsAt, params.startsAt)
			)
		)
		.limit(1);

	if (overlappingBlock) {
		throw new Error(
			"AVAILABILITY_BLOCK_OVERLAP: Listing is unavailable for the selected time range"
		);
	}
};
