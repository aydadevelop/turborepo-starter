import { db } from "@full-stack-cf-app/db";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCancellationRequest,
	bookingDispute,
	bookingRefund,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import z from "zod";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import {
	bookingCancellationRequestOutputSchema,
	bookingDisputeOutputSchema,
	bookingRefundOutputSchema,
	createBookingDisputeInputSchema,
	listManagedBookingCancellationRequestsInputSchema,
	listManagedBookingDisputesInputSchema,
	listManagedBookingRefundsInputSchema,
	processBookingRefundInputSchema,
	requestBookingCancellationInputSchema,
	requestBookingRefundInputSchema,
	reviewBookingCancellationInputSchema,
	reviewBookingDisputeInputSchema,
	reviewBookingRefundInputSchema,
} from "../booking.schemas";
import { successOutputSchema } from "../shared/schema-utils";
import { cancelBookingAndSync } from "./calendar-sync";
import {
	requireActiveMembership,
	requireCustomerBookingAccess,
	requireManagedBooking,
	requireManagedDispute,
	requireManagedRefund,
	requireSessionUserId,
} from "./helpers";
import { emitBookingCancelledNotificationEvent } from "./notification-events";

export const lifecycleBookingRouter = {
	cancellationRequestCreate: protectedProcedure
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Request booking cancellation",
			description: "Submit a cancellation request for a customer booking.",
		})
		.input(requestBookingCancellationInputSchema)
		.output(bookingCancellationRequestOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const customerBooking = await requireCustomerBookingAccess({
				bookingId: input.bookingId,
				userId: sessionUserId,
			});

			if (customerBooking.status === "cancelled") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Booking is already cancelled",
				});
			}

			const [existingRequest] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.bookingId, customerBooking.id))
				.limit(1);

			if (existingRequest) {
				await db
					.update(bookingCancellationRequest)
					.set({
						status: "requested",
						reason: input.reason,
						requestedByUserId: sessionUserId,
						requestedAt: new Date(),
						reviewedByUserId: null,
						reviewedAt: null,
						reviewNote: null,
						updatedAt: new Date(),
					})
					.where(eq(bookingCancellationRequest.id, existingRequest.id));
			} else {
				await db.insert(bookingCancellationRequest).values({
					id: crypto.randomUUID(),
					bookingId: customerBooking.id,
					organizationId: customerBooking.organizationId,
					requestedByUserId: sessionUserId,
					reason: input.reason,
					status: "requested",
					requestedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}

			const [savedRequest] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.bookingId, customerBooking.id))
				.limit(1);

			if (!savedRequest) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return savedRequest;
		}),

	cancellationRequestListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "List managed cancellation requests",
			description:
				"List cancellation requests for the organization, optionally filtered by status.",
		})
		.input(listManagedBookingCancellationRequestsInputSchema)
		.output(z.array(bookingCancellationRequestOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = and(
				eq(
					bookingCancellationRequest.organizationId,
					activeMembership.organizationId
				),
				input.status
					? eq(bookingCancellationRequest.status, input.status)
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(bookingCancellationRequest)
				.where(where)
				.orderBy(desc(bookingCancellationRequest.requestedAt))
				.limit(input.limit);
		}),

	cancellationRequestReviewManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Review cancellation request",
			description:
				"Approve or reject a cancellation request. Approved requests trigger booking cancellation and calendar sync.",
		})
		.input(reviewBookingCancellationInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedBooking = await requireManagedBooking(
				input.bookingId,
				activeMembership.organizationId
			);
			const [existingRequest] = await db
				.select()
				.from(bookingCancellationRequest)
				.where(eq(bookingCancellationRequest.bookingId, managedBooking.id))
				.limit(1);

			if (!existingRequest) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No cancellation request found for booking",
				});
			}

			if (input.decision === "reject") {
				await db
					.update(bookingCancellationRequest)
					.set({
						status: "rejected",
						reviewedByUserId: sessionUserId,
						reviewedAt: new Date(),
						reviewNote: input.reviewNote,
						updatedAt: new Date(),
					})
					.where(eq(bookingCancellationRequest.id, existingRequest.id));

				return { success: true };
			}

			const wasAlreadyCancelled = managedBooking.status === "cancelled";
			await cancelBookingAndSync({
				managedBooking,
				cancelledByUserId: sessionUserId,
				reason: existingRequest.reason ?? input.reviewNote,
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
			await db
				.update(bookingCancellationRequest)
				.set({
					status: "approved",
					reviewedByUserId: sessionUserId,
					reviewedAt: new Date(),
					reviewNote: input.reviewNote,
					updatedAt: new Date(),
				})
				.where(eq(bookingCancellationRequest.id, existingRequest.id));

			return { success: true };
		}),

	disputeCreate: protectedProcedure
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Create booking dispute",
			description: "Raise a dispute against a booking as a customer.",
		})
		.input(createBookingDisputeInputSchema)
		.output(bookingDisputeOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const customerBooking = await requireCustomerBookingAccess({
				bookingId: input.bookingId,
				userId: sessionUserId,
			});

			const disputeId = crypto.randomUUID();
			await db.insert(bookingDispute).values({
				id: disputeId,
				bookingId: customerBooking.id,
				organizationId: customerBooking.organizationId,
				raisedByUserId: sessionUserId,
				status: "open",
				reasonCode: input.reasonCode,
				details: input.details,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdDispute] = await db
				.select()
				.from(bookingDispute)
				.where(eq(bookingDispute.id, disputeId))
				.limit(1);
			if (!createdDispute) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
			return createdDispute;
		}),

	disputeListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "List managed disputes",
			description:
				"List booking disputes for the organization, optionally filtered by status.",
		})
		.input(listManagedBookingDisputesInputSchema)
		.output(z.array(bookingDisputeOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = and(
				eq(bookingDispute.organizationId, activeMembership.organizationId),
				input.status ? eq(bookingDispute.status, input.status) : undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(bookingDispute)
				.where(where)
				.orderBy(desc(bookingDispute.createdAt))
				.limit(input.limit);
		}),

	disputeReviewManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Review booking dispute",
			description: "Resolve or reject a booking dispute raised by a customer.",
		})
		.input(reviewBookingDisputeInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			await requireManagedDispute({
				disputeId: input.disputeId,
				organizationId: activeMembership.organizationId,
			});

			await db
				.update(bookingDispute)
				.set({
					status: input.decision === "resolve" ? "resolved" : "rejected",
					resolution: input.resolution,
					resolvedByUserId: sessionUserId,
					resolvedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(bookingDispute.id, input.disputeId));

			return { success: true };
		}),

	refundRequestCreate: protectedProcedure
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Request booking refund",
			description: "Submit a refund request for a customer booking.",
		})
		.input(requestBookingRefundInputSchema)
		.output(bookingRefundOutputSchema)
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const customerBooking = await requireCustomerBookingAccess({
				bookingId: input.bookingId,
				userId: sessionUserId,
			});

			if (input.amountCents > customerBooking.totalPriceCents) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Refund amount exceeds booking total price",
				});
			}

			const [openRefund] = await db
				.select({ id: bookingRefund.id })
				.from(bookingRefund)
				.where(
					and(
						eq(bookingRefund.bookingId, customerBooking.id),
						inArray(bookingRefund.status, ["requested", "approved"])
					)
				)
				.limit(1);
			if (openRefund) {
				throw new ORPCError("BAD_REQUEST", {
					message: "An active refund request already exists for this booking",
				});
			}

			const refundId = crypto.randomUUID();
			await db.insert(bookingRefund).values({
				id: refundId,
				bookingId: customerBooking.id,
				organizationId: customerBooking.organizationId,
				requestedByUserId: sessionUserId,
				status: "requested",
				amountCents: input.amountCents,
				currency: customerBooking.currency,
				reason: input.reason,
				requestedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdRefund] = await db
				.select()
				.from(bookingRefund)
				.where(eq(bookingRefund.id, refundId))
				.limit(1);
			if (!createdRefund) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
			return createdRefund;
		}),

	refundListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "List managed refunds",
			description:
				"List refund requests for the organization, optionally filtered by status.",
		})
		.input(listManagedBookingRefundsInputSchema)
		.output(z.array(bookingRefundOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			const where = and(
				eq(bookingRefund.organizationId, activeMembership.organizationId),
				input.status ? eq(bookingRefund.status, input.status) : undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select()
				.from(bookingRefund)
				.where(where)
				.orderBy(desc(bookingRefund.createdAt))
				.limit(input.limit);
		}),

	refundReviewManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Review refund request",
			description:
				"Approve or reject a refund request. Approved refunds can optionally adjust the amount.",
		})
		.input(reviewBookingRefundInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedRefund = await requireManagedRefund({
				refundId: input.refundId,
				organizationId: activeMembership.organizationId,
			});

			if (managedRefund.status === "processed") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Processed refunds cannot be reviewed",
				});
			}

			await db
				.update(bookingRefund)
				.set({
					status: input.decision === "approve" ? "approved" : "rejected",
					amountCents:
						input.decision === "approve"
							? (input.approvedAmountCents ?? managedRefund.amountCents)
							: managedRefund.amountCents,
					approvedByUserId:
						input.decision === "approve"
							? sessionUserId
							: managedRefund.approvedByUserId,
					approvedAt: input.decision === "approve" ? new Date() : null,
					failureReason:
						input.decision === "reject"
							? input.reviewNote
							: managedRefund.failureReason,
					updatedAt: new Date(),
				})
				.where(eq(bookingRefund.id, managedRefund.id));

			return { success: true };
		}),

	refundProcessManaged: organizationPermissionProcedure({
		booking: ["update"],
	})
		.route({
			tags: ["Booking Lifecycle"],
			summary: "Process approved refund",
			description:
				"Mark an approved refund as processed or failed. Updates the booking payment status accordingly.",
		})
		.input(processBookingRefundInputSchema)
		.output(
			z.object({ success: z.boolean(), idempotent: z.boolean().optional() })
		)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedRefund = await requireManagedRefund({
				refundId: input.refundId,
				organizationId: activeMembership.organizationId,
			});

			if (
				managedRefund.status === "processed" &&
				input.status === "processed"
			) {
				return { success: true, idempotent: true };
			}
			if (input.status === "processed" && managedRefund.status !== "approved") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only approved refunds can be processed",
				});
			}

			await db
				.update(bookingRefund)
				.set({
					status: input.status,
					provider: input.provider,
					externalRefundId: input.externalRefundId,
					failureReason:
						input.status === "failed"
							? input.failureReason
							: managedRefund.failureReason,
					processedByUserId: sessionUserId,
					processedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(bookingRefund.id, managedRefund.id));

			if (input.status === "processed") {
				const [managedBooking] = await db
					.select()
					.from(booking)
					.where(eq(booking.id, managedRefund.bookingId))
					.limit(1);

				if (managedBooking) {
					const nextRefundAmountCents =
						(managedBooking.refundAmountCents ?? 0) + managedRefund.amountCents;
					let nextPaymentStatus: "refunded" | "unpaid" | "partially_paid";
					if (nextRefundAmountCents >= managedBooking.totalPriceCents) {
						nextPaymentStatus = "refunded";
					} else if (managedBooking.paymentStatus === "unpaid") {
						nextPaymentStatus = "unpaid";
					} else {
						nextPaymentStatus = "partially_paid";
					}

					await db
						.update(booking)
						.set({
							refundAmountCents: nextRefundAmountCents,
							paymentStatus: nextPaymentStatus,
							updatedAt: new Date(),
						})
						.where(eq(booking.id, managedBooking.id));
				}
			}

			return { success: true };
		}),
};
