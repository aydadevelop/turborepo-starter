import { db } from "@full-stack-cf-app/db";
import { boatAvailabilityBlock } from "@full-stack-cf-app/db/schema/boat";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { blockingBookingStatuses } from "../helpers";

export const ensureNoBookingOverlap = async (params: {
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

export const ensureNoBookingOverlapExcluding = async (params: {
	organizationId: string;
	boatId: string;
	startsAt: Date;
	endsAt: Date;
	excludedBookingId: string;
}) => {
	const [overlappingBooking] = await db
		.select({ id: booking.id })
		.from(booking)
		.where(
			and(
				eq(booking.organizationId, params.organizationId),
				eq(booking.boatId, params.boatId),
				ne(booking.id, params.excludedBookingId),
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

export const ensureNoAvailabilityBlockOverlap = async (params: {
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
