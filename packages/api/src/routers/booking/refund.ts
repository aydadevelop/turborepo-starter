import { db } from "@full-stack-cf-app/db";
import {
	booking,
	bookingRefund,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, getTableColumns, inArray, or } from "drizzle-orm";
import z from "zod";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import {
	bookingRefundOutputSchema,
	listManagedBookingRefundsInputSchema,
	listMineBookingRefundsInputSchema,
	processBookingRefundInputSchema,
	requestBookingRefundInputSchema,
	reviewBookingRefundInputSchema,
} from "../booking.schemas";
import { successOutputSchema } from "../shared/schema-utils";
import { reconcileAffiliatePayoutForBooking } from "./services/affiliate";
import {
	requireActiveMembership,
	requireCustomerBookingAccess,
	requireManagedBooking,
	requireManagedRefund,
	requireSessionUserId,
} from "./helpers";

export const refundBookingRouter = {
	refundRequestCreate: protectedProcedure
		.route({
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

	refundListMine: protectedProcedure
		.route({
			summary: "List my booking refunds",
			description:
				"List refund requests for bookings owned by the current signed-in user.",
		})
		.input(listMineBookingRefundsInputSchema)
		.output(z.array(bookingRefundOutputSchema))
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const refundColumns = getTableColumns(bookingRefund);

			const where = and(
				or(
					eq(booking.customerUserId, sessionUserId),
					eq(booking.createdByUserId, sessionUserId)
				),
				input.bookingId
					? eq(bookingRefund.bookingId, input.bookingId)
					: undefined,
				input.status ? eq(bookingRefund.status, input.status) : undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select(refundColumns)
				.from(bookingRefund)
				.innerJoin(booking, eq(booking.id, bookingRefund.bookingId))
				.where(where)
				.orderBy(desc(bookingRefund.createdAt))
				.limit(input.limit);
		}),

	refundListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed refunds",
			description:
				"List refund requests for the organization, optionally filtered by status.",
		})
		.input(listManagedBookingRefundsInputSchema)
		.output(z.array(bookingRefundOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			if (input.bookingId) {
				await requireManagedBooking(
					input.bookingId,
					activeMembership.organizationId
				);
			}

			const where = and(
				eq(bookingRefund.organizationId, activeMembership.organizationId),
				input.bookingId
					? eq(bookingRefund.bookingId, input.bookingId)
					: undefined,
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

					try {
						await reconcileAffiliatePayoutForBooking({
							bookingId: managedBooking.id,
						});
					} catch (error) {
						console.error(
							"Failed to reconcile affiliate payout after refund processing",
							error
						);
					}
				}
			}

			return { success: true };
		}),
};
