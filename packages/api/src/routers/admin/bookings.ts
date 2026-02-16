import { db } from "@full-stack-cf-app/db";
import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingDispute,
	bookingDisputeStatusValues,
	bookingPaymentStatusValues,
	bookingRefund,
	bookingRefundStatusValues,
	bookingSourceValues,
	bookingStatusValues,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte, like, lte, type SQL } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";

import { adminProcedure } from "../../lib/admin";
import { buildUpdatePayload } from "../../lib/db-helpers";
import { successOutputSchema } from "../shared/schema-utils";
import { paginatedOutput, paginationInput } from "./shared";

const bookingOutputSchema = createSelectSchema(booking);
const disputeOutputSchema = createSelectSchema(bookingDispute);
const refundOutputSchema = createSelectSchema(bookingRefund);

export const adminBookingsRouter = {
	list: adminProcedure
		.route({ summary: "List bookings across all organizations" })
		.input(
			paginationInput.extend({
				organizationId: z.string().trim().optional(),
				boatId: z.string().trim().optional(),
				status: z.enum(bookingStatusValues).optional(),
				paymentStatus: z.enum(bookingPaymentStatusValues).optional(),
				source: z.enum(bookingSourceValues).optional(),
				search: z.string().trim().optional(),
				startsAfter: z.coerce.date().optional(),
				startsBefore: z.coerce.date().optional(),
			})
		)
		.output(
			paginatedOutput(
				bookingOutputSchema.extend({
					organizationName: z.string().optional(),
					boatName: z.string().optional(),
					customerName: z.string().optional(),
				})
			)
		)
		.handler(async ({ input }) => {
			const conditions: SQL[] = [];
			if (input.organizationId) {
				conditions.push(eq(booking.organizationId, input.organizationId));
			}
			if (input.boatId) {
				conditions.push(eq(booking.boatId, input.boatId));
			}
			if (input.status) {
				conditions.push(eq(booking.status, input.status));
			}
			if (input.paymentStatus) {
				conditions.push(eq(booking.paymentStatus, input.paymentStatus));
			}
			if (input.source) {
				conditions.push(eq(booking.source, input.source));
			}
			if (input.search) {
				conditions.push(like(booking.contactName, `%${input.search}%`));
			}
			if (input.startsAfter) {
				conditions.push(gte(booking.startsAt, input.startsAfter));
			}
			if (input.startsBefore) {
				conditions.push(lte(booking.startsAt, input.startsBefore));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [rows, countRows] = await Promise.all([
				db
					.select({
						booking,
						organizationName: organization.name,
						boatName: boat.name,
						customerName: user.name,
					})
					.from(booking)
					.leftJoin(organization, eq(organization.id, booking.organizationId))
					.leftJoin(boat, eq(boat.id, booking.boatId))
					.leftJoin(user, eq(user.id, booking.customerUserId))
					.where(where)
					.orderBy(desc(booking.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(booking).where(where),
			]);

			return {
				items: rows.map((r) => ({
					...r.booking,
					organizationName: r.organizationName ?? undefined,
					boatName: r.boatName ?? undefined,
					customerName: r.customerName ?? undefined,
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	get: adminProcedure
		.route({ summary: "Get a booking by ID" })
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(
			bookingOutputSchema.extend({
				organizationName: z.string().optional(),
				boatName: z.string().optional(),
				customerName: z.string().optional(),
				customerEmail: z.string().optional(),
			})
		)
		.handler(async ({ input }) => {
			const [row] = await db
				.select({
					booking,
					organizationName: organization.name,
					boatName: boat.name,
					customerName: user.name,
					customerEmail: user.email,
				})
				.from(booking)
				.leftJoin(organization, eq(organization.id, booking.organizationId))
				.leftJoin(boat, eq(boat.id, booking.boatId))
				.leftJoin(user, eq(user.id, booking.customerUserId))
				.where(eq(booking.id, input.id))
				.limit(1);

			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Booking not found" });
			}

			return {
				...row.booking,
				organizationName: row.organizationName ?? undefined,
				boatName: row.boatName ?? undefined,
				customerName: row.customerName ?? undefined,
				customerEmail: row.customerEmail ?? undefined,
			};
		}),

	updateStatus: adminProcedure
		.route({ summary: "Update booking status as admin" })
		.input(
			z.object({
				id: z.string().trim().min(1),
				status: z.enum(bookingStatusValues).optional(),
				paymentStatus: z.enum(bookingPaymentStatusValues).optional(),
				notes: z.string().trim().optional(),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const { id, ...fields } = input;
			const payload = buildUpdatePayload(fields);

			const [updated] = await db
				.update(booking)
				.set(payload)
				.where(eq(booking.id, id))
				.returning({ id: booking.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Booking not found" });
			}

			return { success: true };
		}),

	// ── Disputes ────────────────────────────────────────────

	listDisputes: adminProcedure
		.route({ summary: "List disputes across all organizations" })
		.input(
			paginationInput.extend({
				status: z.enum(bookingDisputeStatusValues).optional(),
				organizationId: z.string().trim().optional(),
			})
		)
		.output(paginatedOutput(disputeOutputSchema))
		.handler(async ({ input }) => {
			const conditions: SQL[] = [];
			if (input.status) {
				conditions.push(eq(bookingDispute.status, input.status));
			}
			if (input.organizationId) {
				conditions.push(
					eq(bookingDispute.organizationId, input.organizationId)
				);
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [items, countRows] = await Promise.all([
				db
					.select()
					.from(bookingDispute)
					.where(where)
					.orderBy(desc(bookingDispute.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(bookingDispute).where(where),
			]);

			return { items, total: countRows[0]?.value ?? 0 };
		}),

	resolveDispute: adminProcedure
		.route({ summary: "Resolve a dispute" })
		.input(
			z.object({
				id: z.string().trim().min(1),
				status: z.enum(["resolved", "rejected"]),
				resolution: z.string().trim().optional(),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const [updated] = await db
				.update(bookingDispute)
				.set({
					status: input.status,
					resolution: input.resolution,
					resolvedByUserId: context.adminUserId,
					resolvedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(bookingDispute.id, input.id))
				.returning({ id: bookingDispute.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Dispute not found" });
			}

			return { success: true };
		}),

	// ── Refunds ─────────────────────────────────────────────

	listRefunds: adminProcedure
		.route({ summary: "List refunds across all organizations" })
		.input(
			paginationInput.extend({
				status: z.enum(bookingRefundStatusValues).optional(),
				organizationId: z.string().trim().optional(),
			})
		)
		.output(paginatedOutput(refundOutputSchema))
		.handler(async ({ input }) => {
			const conditions: SQL[] = [];
			if (input.status) {
				conditions.push(eq(bookingRefund.status, input.status));
			}
			if (input.organizationId) {
				conditions.push(eq(bookingRefund.organizationId, input.organizationId));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [items, countRows] = await Promise.all([
				db
					.select()
					.from(bookingRefund)
					.where(where)
					.orderBy(desc(bookingRefund.requestedAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(bookingRefund).where(where),
			]);

			return { items, total: countRows[0]?.value ?? 0 };
		}),

	approveRefund: adminProcedure
		.route({ summary: "Approve a refund request" })
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const [updated] = await db
				.update(bookingRefund)
				.set({
					status: "approved",
					approvedByUserId: context.adminUserId,
					approvedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(bookingRefund.id, input.id))
				.returning({ id: bookingRefund.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Refund not found" });
			}

			return { success: true };
		}),
};
