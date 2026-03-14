import {
	type BookingRow,
	type CancellationReasonCode,
	type CancellationRequestRow,
	createBooking,
	getActiveCancellationRequest,
	getOrgBooking,
	listCustomerBookings,
	listOrgBookings,
	listOrgCancellationRequests,
	processCancellationWorkflow,
	requestCancellation,
	updateBookingSchedule,
	updateBookingStatus,
} from "@my-app/booking";
import { db } from "@my-app/db";
import {
	getPromotionErrorLabel,
	isPromotionErrorCode,
} from "@my-app/promotions";
import { ORPCError } from "@orpc/server";

import { buildWorkflowContext } from "../context";
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

const throwApplyCancellationError = (error: Error): never => {
	if (error.message === "NOT_FOUND") {
		throw new ORPCError("NOT_FOUND");
	}

	if (error.message === "INVALID_STATE") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Request is not in 'requested' state",
		});
	}

	throw error;
};

const getRequiredSessionUserId = (context: {
	session?: { user?: { id?: string } | null } | null;
}): string => {
	const userId = context.session?.user?.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return userId;
};

const throwRequestCancellationError = (error: Error): never => {
	if (error.message === "NOT_FOUND") {
		throw new ORPCError("NOT_FOUND");
	}
	if (error.message === "INVALID_STATE") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Booking is not in a cancellable state",
		});
	}
	if (error.message === "DUPLICATE_REQUEST") {
		throw new ORPCError("CONFLICT", {
			message: "A cancellation request already exists for this booking",
		});
	}
	if (error.message === "INVALID_REASON_CODE") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Invalid reason code",
		});
	}
	if (error.message === "REASON_CODE_NOT_ALLOWED") {
		throw new ORPCError("FORBIDDEN", {
			message: "Reason code not allowed for this actor",
		});
	}
	if (error.message === "EVIDENCE_REQUIRED") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Evidence is required for this reason code",
		});
	}

	throw error;
};

export const bookingRouter = {
	create: protectedProcedure.booking.create.handler(
		async ({ context, input }) => {
			const customerUserId = getRequiredSessionUserId(context);
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
						discountCode: input.discountCode,
						source: "web",
						customerUserId,
						createdByUserId: customerUserId,
					},
					db,
				);
				return formatBooking(row);
			} catch (e) {
				if (e instanceof Error) {
					if (e.message === "SLOT_UNAVAILABLE") {
						throw new ORPCError("CONFLICT", { message: "Slot is unavailable" });
					}
					if (e.message === "NO_PRICING_PROFILE") {
						throw new ORPCError("PRECONDITION_FAILED", {
							message: "No pricing profile for this listing",
						});
					}
					if (e.message === "PUBLICATION_ORG_MISMATCH") {
						throw new ORPCError("PRECONDITION_FAILED", {
							message: "Listing publication is misconfigured",
						});
					}
					if (e.message === "NOT_FOUND") {
						throw new ORPCError("NOT_FOUND", {
							message: "Listing is not bookable",
						});
					}
					if (isPromotionErrorCode(e.message)) {
						throw new ORPCError("BAD_REQUEST", {
							message: getPromotionErrorLabel(e.message),
						});
					}
				}
				throw e;
			}
		},
	),

	listOrgBookings: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.listOrgBookings.handler(async ({ context, input }) => {
		const result = await listOrgBookings(
			context.activeMembership.organizationId,
			{
				filter: input.filter,
				page: input.page,
				search: input.search,
				sort: input.sort,
			},
			db,
		);
		return {
			items: result.items.map(formatBooking),
			page: {
				limit: input.page.limit,
				offset: input.page.offset,
				total: result.total,
				hasMore: input.page.offset + result.items.length < result.total,
			},
		};
	}),

	getBooking: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.getBooking.handler(async ({ context, input }) => {
		try {
			const row = await getOrgBooking(
				input.id,
				context.activeMembership.organizationId,
				db,
			);
			return formatBooking(row);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND");
			}
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
					workflowContext: buildWorkflowContext(
						context,
						`booking:${input.status}:${input.id}`,
					),
				},
				db,
			);

			return formatBooking(row);
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND");
				}
				if (e.message === "INVALID_TRANSITION") {
					throw new ORPCError("BAD_REQUEST", {
						message: "Invalid booking status transition",
					});
				}
			}
			throw e;
		}
	}),

	updateSchedule: organizationPermissionProcedure({
		booking: ["update"],
	}).booking.updateSchedule.handler(async ({ context, input }) => {
		try {
			const row = await updateBookingSchedule(
				{
					id: input.id,
					organizationId: context.activeMembership.organizationId,
					startsAt: new Date(input.startsAt),
					endsAt: new Date(input.endsAt),
					timezone: input.timezone,
					workflowContext: buildWorkflowContext(
						context,
						`booking:schedule-updated:${input.id}:${input.startsAt}:${input.endsAt}`,
					),
				},
				db,
			);

			return formatBooking(row);
		} catch (e) {
			if (e instanceof Error) {
				if (e.message === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND");
				}
				if (e.message === "INVALID_STATE") {
					throw new ORPCError("BAD_REQUEST", {
						message: "Booking cannot be rescheduled in its current state",
					});
				}
				if (
					e.message ===
						"BOOKING_OVERLAP: Listing is already booked for the selected time range" ||
					e.message ===
						"AVAILABILITY_BLOCK_OVERLAP: Listing is unavailable for the selected time range"
				) {
					throw new ORPCError("CONFLICT", {
						message: "Selected booking window is unavailable",
					});
				}
			}
			throw e;
		}
	}),

	// AUTH-02: Only the authenticated user's own bookings — scoped strictly by session user ID
	listMyBookings: protectedProcedure.booking.listMyBookings.handler(
		async ({ context }) => {
			const customerUserId = getRequiredSessionUserId(context);
			const rows = await listCustomerBookings(customerUserId, db);
			return rows.map(formatBooking);
		},
	),

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
				return throwRequestCancellationError(e);
			}
			throw e;
		}
	}),

	applyCancellation: organizationPermissionProcedure({
		booking: ["update"],
	}).booking.applyCancellation.handler(async ({ context, input }) => {
		const result = await processCancellationWorkflow(db).execute(
			{
				requestId: input.requestId,
				organizationId: context.activeMembership.organizationId,
				appliedByUserId: context.session?.user?.id ?? "system",
			},
			buildWorkflowContext(context, `booking-cancellation:${input.requestId}`),
		);

		if (!result.success) {
			return throwApplyCancellationError(result.error);
		}

		const { output } = result;

		return {
			requestId: output.requestId,
			refundId: output.refundId,
		};
	}),

	getActiveCancellationRequest: organizationPermissionProcedure({
		booking: ["read"],
	}).booking.getActiveCancellationRequest.handler(
		async ({ context, input }) => {
			const row = await getActiveCancellationRequest(
				input.bookingId,
				context.activeMembership.organizationId,
				db,
			);
			if (!row) {
				return null;
			}
			return formatCancellationRequest(row);
		},
	),

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
