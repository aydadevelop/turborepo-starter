import { db } from "@my-app/db";
import {
	addTicketMessage,
	createSupportTicket,
	getTicket,
	listOrgTickets,
} from "@my-app/support";
import { ORPCError } from "@orpc/server";

import { organizationPermissionProcedure } from "../index";

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
};
