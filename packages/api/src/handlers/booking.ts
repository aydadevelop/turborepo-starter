import { ORPCError } from "@orpc/server";
import { db } from "@my-app/db";
import {
	applyCancellation,
	createBooking,
	getActiveCancellationRequest,
	getOrgBooking,
	listCustomerBookings,
	listOrgBookings,
	listOrgCancellationRequests,
	requestCancellation,
	updateBookingStatus,
	type BookingRow,
	type CancellationReasonCode,
	type CancellationRequestRow,
} from "@my-app/booking";
import { notificationsPusher } from "@my-app/notifications/pusher";

import { organizationPermissionProcedure, protectedProcedure } from "../index";

const formatBooking = (row: BookingRow) => ({
	...row,
	startsAt: row.startsAt.toISOString(),
	endsAt: row.endsAt.toISOString(),
	cancelledAt: row.cancelledAt?.toISOString() ?? null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const formatCancellationRequest = (row: CancellationRequestRow) => ({
	...row,
	appliedAt: row.appliedAt?.toISOString() ?? null,
	requestedAt: row.requestedAt.toISOString(),
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export const bookingRouter = {
	create: protectedProcedure.booking.create.handler(async ({ context, input }) => {
		const customerUserId = context.session!.user!.id;
		try {
			const row = await createBooking(
				{
					listingId: input.listingId,
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
				if (e.message === "PUBLICATION_ORG_MISMATCH") throw new ORPCError("PRECONDITION_FAILED", { message: "Listing publication is misconfigured" });
				if (e.message === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: "Listing is not bookable" });
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

			// Emit notifications for status transitions
			const orgId = context.activeMembership.organizationId;
			if (input.status === "confirmed" || input.status === "cancelled") {
				const eventType =
					input.status === "confirmed"
						? "booking.status.confirmed"
						: "booking.status.cancelled";
				await notificationsPusher({
					input: {
						organizationId: orgId,
						actorUserId: context.session?.user?.id,
						eventType,
						sourceType: "booking",
						sourceId: input.id,
						idempotencyKey: `${eventType}:${input.id}`,
						payload: {
							recipients: [],
						},
					},
					queue: context.notificationQueue,
				}).catch(() => {
					// Non-blocking — notification failure must not fail the status update
				});
			}

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

	requestCancellation: organizationPermissionProcedure({
		booking: ["update"],
	}).booking.requestCancellation.handler(async ({ context, input }) => {
		try {
			const { request, outcome } = await requestCancellation(
				{
					bookingId: input.bookingId,
					organizationId: context.activeMembership.organizationId,
					requestedByUserId: context.session?.user?.id,
					initiatedByRole: input.initiatedByRole,
					reason: input.reason,
					reasonCode: input.reasonCode as CancellationReasonCode | undefined,
					evidence: input.evidence,
				},
				db,
			);
			return { request: formatCancellationRequest(request), outcome };
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === "NOT_FOUND") throw new ORPCError("NOT_FOUND");
				if (e.message === "INVALID_STATE") throw new ORPCError("BAD_REQUEST", { message: "Booking is not in a cancellable state" });
				if (e.message === "DUPLICATE_REQUEST") throw new ORPCError("CONFLICT", { message: "A cancellation request already exists for this booking" });
				if (e.message === "INVALID_REASON_CODE") throw new ORPCError("BAD_REQUEST", { message: "Invalid reason code" });
				if (e.message === "REASON_CODE_NOT_ALLOWED") throw new ORPCError("FORBIDDEN", { message: "Reason code not allowed for this actor" });
				if (e.message === "EVIDENCE_REQUIRED") throw new ORPCError("BAD_REQUEST", { message: "Evidence is required for this reason code" });
			}
			throw e;
		}
	}),

	applyCancellation: organizationPermissionProcedure({
		booking: ["update"],
	}).booking.applyCancellation.handler(async ({ context, input }) => {
		try {
			const { request, refundId } = await applyCancellation(
				input.requestId,
				context.activeMembership.organizationId,
				context.session?.user?.id ?? "system",
				db,
			);
			return { requestId: request.id, refundId };
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === "NOT_FOUND") throw new ORPCError("NOT_FOUND");
				if (e.message === "INVALID_STATE") throw new ORPCError("BAD_REQUEST", { message: "Request is not in 'requested' state" });
			}
			throw e;
		}
	}),

	getActiveCancellationRequest: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.getActiveCancellationRequest.handler(async ({ context, input }) => {
		const row = await getActiveCancellationRequest(
			input.bookingId,
			context.activeMembership.organizationId,
			db,
		);
		if (!row) return null;
		return formatCancellationRequest(row);
	}),

	listCancellationRequests: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.listCancellationRequests.handler(async ({ context }) => {
		const rows = await listOrgCancellationRequests(
			context.activeMembership.organizationId,
			db,
		);
		return rows.map(formatCancellationRequest);
	}),
};
