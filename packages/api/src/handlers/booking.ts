import { ORPCError } from "@orpc/server";
import { db } from "@my-app/db";
import {
	createBooking,
	getOrgBooking,
	listCustomerBookings,
	listOrgBookings,
	updateBookingStatus,
	type BookingRow,
} from "@my-app/booking";

import { organizationPermissionProcedure, protectedProcedure } from "../index";

const formatBooking = (row: BookingRow) => ({
	...row,
	startsAt: row.startsAt.toISOString(),
	endsAt: row.endsAt.toISOString(),
	cancelledAt: row.cancelledAt?.toISOString() ?? null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const bookingRouter = {
	create: protectedProcedure.booking.create.handler(async ({ context, input }) => {
		const customerUserId = context.session!.user!.id;
		try {
			const row = await createBooking(
				{
					organizationId: input.organizationId,
					listingId: input.listingId,
					publicationId: input.publicationId,
					startsAt: new Date(input.startsAt),
					endsAt: new Date(input.endsAt),
					passengers: input.passengers,
					contactName: input.contactName,
					contactPhone: input.contactPhone,
					contactEmail: input.contactEmail,
					timezone: input.timezone,
					notes: input.notes,
					specialRequests: input.specialRequests,
					currency: input.currency,
					source: "web",
					customerUserId,
					createdByUserId: customerUserId,
				},
				db,
			);
			return formatBooking(row);
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === "SLOT_UNAVAILABLE") throw new ORPCError("CONFLICT", { message: "Slot is unavailable" });
				if (e.message === "NO_PRICING_PROFILE") throw new ORPCError("PRECONDITION_FAILED", { message: "No pricing profile for this listing" });
				if (e.message === "NOT_FOUND") throw new ORPCError("NOT_FOUND");
			}
			throw e;
		}
	}),

	listOrgBookings: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.listOrgBookings.handler(async ({ context, input }) => {
		const rows = await listOrgBookings(
			context.activeMembership.organizationId,
			{
				listingId: input.listingId,
				// biome-ignore lint/suspicious/noExplicitAny: status comes as string from input
				status: input.status as any,
				limit: input.limit,
				offset: input.offset,
			},
			db,
		);
		return rows.map(formatBooking);
	}),

	getBooking: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.getBooking.handler(async ({ context, input }) => {
		try {
			const row = await getOrgBooking(input.id, context.activeMembership.organizationId, db);
			return formatBooking(row);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") throw new ORPCError("NOT_FOUND");
			throw e;
		}
	}),

	updateStatus: organizationPermissionProcedure({
		booking: ["update"],
	}).booking.updateStatus.handler(async ({ context, input }) => {
		try {
			const row = await updateBookingStatus(
				{
					id: input.id,
					organizationId: context.activeMembership.organizationId,
					status: input.status,
					cancellationReason: input.cancellationReason,
					cancelledByUserId: input.cancelledByUserId,
				},
				db,
			);
			return formatBooking(row);
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === "NOT_FOUND") throw new ORPCError("NOT_FOUND");
				if (e.message === "INVALID_TRANSITION") throw new ORPCError("BAD_REQUEST", { message: "Invalid booking status transition" });
			}
			throw e;
		}
	}),

	// AUTH-02: Only the authenticated user's own bookings — scoped strictly by session user ID
	listMyBookings: protectedProcedure.booking.listMyBookings.handler(async ({ context }) => {
		const customerUserId = context.session!.user!.id;
		const rows = await listCustomerBookings(customerUserId, db);
		return rows.map(formatBooking);
	}),
};
