import { db } from "@full-stack-cf-app/db";
import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import {
	supportTicket,
	supportTicketPriorityValues,
	supportTicketSourceValues,
	supportTicketStatusValues,
} from "@full-stack-cf-app/db/schema/support";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import { successOutputSchema } from "../../contracts/shared";
import { buildUpdatePayload } from "../../lib/db-helpers";
import { adminProcedure } from "../shared/admin";
import { paginatedOutput, paginationInput } from "./shared";

const ticketOutputSchema = createSelectSchema(supportTicket);

export const adminSupportRouter = {
	listTickets: adminProcedure
		.route({ summary: "List support tickets across all organizations" })
		.input(
			paginationInput.extend({
				organizationId: z.string().trim().optional(),
				status: z.enum(supportTicketStatusValues).optional(),
				priority: z.enum(supportTicketPriorityValues).optional(),
				source: z.enum(supportTicketSourceValues).optional(),
				assignedToUserId: z.string().trim().optional(),
				search: z.string().trim().optional(),
			})
		)
		.output(
			paginatedOutput(
				ticketOutputSchema.extend({
					organizationName: z.string().optional(),
					assignedToName: z.string().optional(),
				})
			)
		)
		.handler(async ({ input }) => {
			const conditions: SQL[] = [];
			if (input.organizationId) {
				conditions.push(eq(supportTicket.organizationId, input.organizationId));
			}
			if (input.status) {
				conditions.push(eq(supportTicket.status, input.status));
			}
			if (input.priority) {
				conditions.push(eq(supportTicket.priority, input.priority));
			}
			if (input.source) {
				conditions.push(eq(supportTicket.source, input.source));
			}
			if (input.assignedToUserId) {
				conditions.push(
					eq(supportTicket.assignedToUserId, input.assignedToUserId)
				);
			}
			if (input.search) {
				const search = `%${input.search.toLowerCase()}%`;
				conditions.push(
					sql`(lower(${supportTicket.subject}) like ${search} or lower(coalesce(${supportTicket.description}, '')) like ${search})`
				);
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const assignedUser = db
				.select({ id: user.id, name: user.name })
				.from(user)
				.as("assignedUser");

			const [rows, countRows] = await Promise.all([
				db
					.select({
						ticket: supportTicket,
						organizationName: organization.name,
						assignedToName: assignedUser.name,
					})
					.from(supportTicket)
					.leftJoin(
						organization,
						eq(organization.id, supportTicket.organizationId)
					)
					.leftJoin(
						assignedUser,
						eq(assignedUser.id, supportTicket.assignedToUserId)
					)
					.where(where)
					.orderBy(desc(supportTicket.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(supportTicket).where(where),
			]);

			return {
				items: rows.map((r) => ({
					...r.ticket,
					organizationName: r.organizationName ?? undefined,
					assignedToName: r.assignedToName ?? undefined,
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	getTicket: adminProcedure
		.route({ summary: "Get a support ticket by ID" })
		.input(z.object({ id: z.string().trim().min(1) }))
		.output(
			ticketOutputSchema.extend({
				organizationName: z.string().optional(),
			})
		)
		.handler(async ({ input }) => {
			const [row] = await db
				.select({
					ticket: supportTicket,
					organizationName: organization.name,
				})
				.from(supportTicket)
				.leftJoin(
					organization,
					eq(organization.id, supportTicket.organizationId)
				)
				.where(eq(supportTicket.id, input.id))
				.limit(1);

			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
			}

			return {
				...row.ticket,
				organizationName: row.organizationName ?? undefined,
			};
		}),

	updateTicket: adminProcedure
		.route({ summary: "Update a support ticket as admin" })
		.input(
			z.object({
				id: z.string().trim().min(1),
				status: z.enum(supportTicketStatusValues).optional(),
				priority: z.enum(supportTicketPriorityValues).optional(),
				assignedToUserId: z.string().trim().optional(),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ input }) => {
			const { id, ...fields } = input;
			const payload = buildUpdatePayload(fields);

			const [updated] = await db
				.update(supportTicket)
				.set(payload)
				.where(eq(supportTicket.id, id))
				.returning({ id: supportTicket.id });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
			}

			return { success: true };
		}),
};
