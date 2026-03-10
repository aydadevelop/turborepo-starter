import { db } from "@my-app/db";
import { supportTicket } from "@my-app/db/schema/support";
import {
	addTicketMessage,
	createSupportTicket,
	getCustomerTicket,
	getTicket,
	listCustomerTickets,
	listOrgTickets,
	listTicketMessages,
} from "@my-app/support";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { organizationPermissionProcedure, protectedProcedure } from "../index";

function formatTicket(row: {
	id: string;
	organizationId: string;
	bookingId: string | null;
	customerUserId: string | null;
	createdByUserId: string | null;
	subject: string;
	description: string | null;
	status: "open" | "pending_customer" | "pending_operator" | "escalated" | "resolved" | "closed";
	priority: "low" | "normal" | "high" | "urgent";
	source: "manual" | "web" | "telegram" | "avito" | "email" | "api";
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function formatMessage(row: {
	id: string;
	ticketId: string;
	authorUserId: string | null;
	channel: "internal" | "web" | "telegram" | "avito" | "email" | "api";
	body: string;
	isInternal: boolean;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export const supportRouter = {
	createTicket: organizationPermissionProcedure({
		support: ["create"],
	}).support.createTicket.handler(async ({ context, input }) => {
		const ticket = await createSupportTicket(
			{
				organizationId: context.activeMembership.organizationId,
				bookingId: input.bookingId,
				customerUserId: input.customerUserId,
				createdByUserId: context.session?.user?.id,
				subject: input.subject,
				description: input.description,
				priority: input.priority,
				source: input.source,
			},
			db,
		);
		return formatTicket(ticket);
	}),

	addMessage: organizationPermissionProcedure({
		support: ["create"],
	}).support.addMessage.handler(async ({ context, input }) => {
		try {
			const message = await addTicketMessage(
				{
					ticketId: input.ticketId,
					organizationId: context.activeMembership.organizationId,
					authorUserId: context.session?.user?.id,
					channel: input.channel,
					body: input.body,
					isInternal: input.isInternal,
				},
				db,
			);
			return formatMessage(message);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
			}
			throw e;
		}
	}),

	getTicket: organizationPermissionProcedure({
		support: ["read"],
	}).support.getTicket.handler(async ({ context, input }) => {
		try {
			const ticket = await getTicket(
				input.ticketId,
				context.activeMembership.organizationId,
				db,
			);
			return formatTicket(ticket);
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
			}
			throw e;
		}
	}),

	listOrgTickets: organizationPermissionProcedure({
		support: ["read"],
	}).support.listOrgTickets.handler(async ({ context, input }) => {
		const tickets = await listOrgTickets(
			context.activeMembership.organizationId,
			{
				status: input.status,
				bookingId: input.bookingId,
				limit: input.limit,
				offset: input.offset,
			},
			db,
		);
		return tickets.map(formatTicket);
	}),

	listMyTickets: protectedProcedure.support.listMyTickets.handler(async ({ context, input }) => {
		const customerUserId = context.session!.user!.id;
		const tickets = await listCustomerTickets(
			customerUserId,
			{
				bookingId: input.bookingId,
				limit: input.limit,
				offset: input.offset,
			},
			db,
		);
		return tickets.map(formatTicket);
	}),

	getMyTicket: protectedProcedure.support.getMyTicket.handler(async ({ context, input }) => {
		const userId = context.session!.user!.id;
		try {
			const ticket = await getCustomerTicket(input.ticketId, userId, db);
			const messages = await listTicketMessages(input.ticketId, db);
			return {
				ticket: formatTicket(ticket),
				messages: messages.map(formatMessage),
			};
		} catch (e) {
			if (e instanceof Error && e.message === "NOT_FOUND") {
				throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
			}
			throw e;
		}
	}),

	addMyMessage: protectedProcedure.support.addMyMessage.handler(async ({ context, input }) => {
		const userId = context.session!.user!.id;
		const [ticket] = await db
			.select({
				id: supportTicket.id,
				organizationId: supportTicket.organizationId,
				customerUserId: supportTicket.customerUserId,
			})
			.from(supportTicket)
			.where(eq(supportTicket.id, input.ticketId))
			.limit(1);
		if (!ticket || ticket.customerUserId !== userId) {
			throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
		}
		const message = await addTicketMessage(
			{
				ticketId: input.ticketId,
				organizationId: ticket.organizationId,
				authorUserId: userId,
				channel: "web",
				body: input.body,
				isInternal: false,
			},
			db,
		);
		return formatMessage(message);
	}),
};
