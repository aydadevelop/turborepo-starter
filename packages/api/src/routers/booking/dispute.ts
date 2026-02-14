import { db } from "@full-stack-cf-app/db";
import {
	booking,
	bookingDispute,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, getTableColumns, or } from "drizzle-orm";
import z from "zod";
import {
	organizationPermissionProcedure,
	protectedProcedure,
} from "../../index";
import {
	bookingDisputeOutputSchema,
	createBookingDisputeInputSchema,
	listManagedBookingDisputesInputSchema,
	listMineBookingDisputesInputSchema,
	reviewBookingDisputeInputSchema,
} from "../booking.schemas";
import { successOutputSchema } from "../shared/schema-utils";
import {
	requireActiveMembership,
	requireCustomerBookingAccess,
	requireManagedBooking,
	requireManagedDispute,
	requireSessionUserId,
} from "./helpers";

export const disputeBookingRouter = {
	disputeCreate: protectedProcedure
		.route({
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

	disputeListMine: protectedProcedure
		.route({
			summary: "List my booking disputes",
			description:
				"List disputes for bookings owned by the current signed-in user.",
		})
		.input(listMineBookingDisputesInputSchema)
		.output(z.array(bookingDisputeOutputSchema))
		.handler(async ({ context, input }) => {
			const sessionUserId = requireSessionUserId(context);
			const disputeColumns = getTableColumns(bookingDispute);

			const where = and(
				or(
					eq(booking.customerUserId, sessionUserId),
					eq(booking.createdByUserId, sessionUserId)
				),
				input.bookingId
					? eq(bookingDispute.bookingId, input.bookingId)
					: undefined,
				input.status ? eq(bookingDispute.status, input.status) : undefined
			);
			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return await db
				.select(disputeColumns)
				.from(bookingDispute)
				.innerJoin(booking, eq(booking.id, bookingDispute.bookingId))
				.where(where)
				.orderBy(desc(bookingDispute.createdAt))
				.limit(input.limit);
		}),

	disputeListManaged: organizationPermissionProcedure({
		booking: ["read"],
	})
		.route({
			summary: "List managed disputes",
			description:
				"List booking disputes for the organization, optionally filtered by status.",
		})
		.input(listManagedBookingDisputesInputSchema)
		.output(z.array(bookingDisputeOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			if (input.bookingId) {
				await requireManagedBooking(
					input.bookingId,
					activeMembership.organizationId
				);
			}

			const where = and(
				eq(bookingDispute.organizationId, activeMembership.organizationId),
				input.bookingId
					? eq(bookingDispute.bookingId, input.bookingId)
					: undefined,
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
};
