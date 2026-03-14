import { db } from "@my-app/db";
import { EventBus } from "@my-app/events";
import {
	addCustomerTicketMessage,
	addTicketMessage,
	assignTicket,
	createSupportTicket,
	getCustomerTicketThread,
	getOperatorSupportSummary,
	getOperatorTicketThread,
	getTicket,
	listCustomerTickets,
	listOrgTickets,
	updateTicketDueAt,
	updateTicketPriority,
	updateTicketStatus,
} from "@my-app/support";
import { ORPCError } from "@orpc/server";

import { organizationPermissionProcedure, protectedProcedure } from "../index";

function toIsoString(value: Date | null | undefined) {
	return value ? value.toISOString() : null;
}

function formatOperatorTicket(row: {
	id: string;
	organizationId: string;
	bookingId: string | null;
	customerUserId: string | null;
	createdByUserId: string | null;
	assignedToUserId: string | null;
	resolvedByUserId: string | null;
	closedByUserId: string | null;
	subject: string;
	description: string | null;
	status:
		| "open"
		| "pending_customer"
		| "pending_operator"
		| "escalated"
		| "resolved"
		| "closed";
	priority: "low" | "normal" | "high" | "urgent";
	source: "manual" | "web" | "telegram" | "avito" | "email" | "api";
	dueAt: Date | null;
	resolvedAt: Date | null;
	closedAt: Date | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		...row,
		dueAt: toIsoString(row.dueAt),
		resolvedAt: toIsoString(row.resolvedAt),
		closedAt: toIsoString(row.closedAt),
		metadata: row.metadata ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function formatCustomerTicket(row: {
	id: string;
	organizationId: string;
	bookingId: string | null;
	customerUserId: string | null;
	subject: string;
	description: string | null;
	status:
		| "open"
		| "pending_customer"
		| "pending_operator"
		| "escalated"
		| "resolved"
		| "closed";
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

function formatOperatorMessage(row: {
	id: string;
	ticketId: string;
	authorUserId: string | null;
	channel: "internal" | "web" | "telegram" | "avito" | "email" | "api";
	body: string;
	isInternal: boolean;
	inboundMessageId: string | null;
	attachments: Array<{ name: string; url: string; mimeType?: string }> | null;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		...row,
		attachments: row.attachments ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function formatCustomerMessage(row: {
	id: string;
	ticketId: string;
	authorUserId: string | null;
	channel: "internal" | "web" | "telegram" | "avito" | "email" | "api";
	body: string;
	isInternal: boolean;
	attachments: Array<{ name: string; url: string; mimeType?: string }> | null;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		...row,
		attachments: row.attachments ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

const getSupportActorContext = (context: {
	eventBus?: EventBus;
	notificationQueue?: {
		send(message: unknown, options?: { delaySeconds?: number }): Promise<void>;
	};
	session?: {
		user?: {
			id?: string | null;
		};
	} | null;
}) => ({
	actorUserId: context.session?.user?.id ?? undefined,
	eventBus: context.eventBus ?? new EventBus(),
});

const throwSupportNotFound = (error: unknown) => {
	if (error instanceof Error && error.message === "NOT_FOUND") {
		throw new ORPCError("NOT_FOUND", { message: "Ticket not found" });
	}

	throw error;
};

const getRequiredSessionUserId = (context: {
	session?: {
		user?: {
			id?: string | null;
		};
	} | null;
}): string => {
	const userId = context.session?.user?.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication required",
		});
	}

	return userId;
};

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
			getSupportActorContext(context),
		);
		return formatOperatorTicket(ticket);
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
				getSupportActorContext(context),
			);
			return formatOperatorMessage(message);
		} catch (e) {
			return throwSupportNotFound(e);
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
			return formatOperatorTicket(ticket);
		} catch (e) {
			return throwSupportNotFound(e);
		}
	}),

	listOrgTickets: organizationPermissionProcedure({
		support: ["read"],
	}).support.listOrgTickets.handler(async ({ context, input }) => {
		const result = await listOrgTickets(
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
			items: result.items.map(formatOperatorTicket),
			page: {
				limit: input.page.limit,
				offset: input.page.offset,
				total: result.total,
				hasMore: input.page.offset + result.items.length < result.total,
			},
		};
	}),

	getTicketThread: organizationPermissionProcedure({
		support: ["update"],
	}).support.getTicketThread.handler(async ({ context, input }) => {
		try {
			const thread = await getOperatorTicketThread(
				input.ticketId,
				context.activeMembership.organizationId,
				db,
			);
			return {
				ticket: formatOperatorTicket(thread.ticket),
				messages: thread.messages.map(formatOperatorMessage),
			};
		} catch (e) {
			return throwSupportNotFound(e);
		}
	}),

	getOperatorSummary: organizationPermissionProcedure({
		support: ["read"],
	}).support.getOperatorSummary.handler(({ context }) => {
		return getOperatorSupportSummary(
			context.activeMembership.organizationId,
			db,
		);
	}),

	assignTicket: organizationPermissionProcedure({
		support: ["update"],
	}).support.assignTicket.handler(async ({ context, input }) => {
		try {
			const ticket = await assignTicket(
				{
					ticketId: input.ticketId,
					organizationId: context.activeMembership.organizationId,
					assignedToUserId: input.assignedToUserId,
				},
				db,
				getSupportActorContext(context),
			);
			return formatOperatorTicket(ticket);
		} catch (e) {
			return throwSupportNotFound(e);
		}
	}),

	updateTicketStatus: organizationPermissionProcedure({
		support: ["update"],
	}).support.updateTicketStatus.handler(async ({ context, input }) => {
		try {
			const ticket = await updateTicketStatus(
				{
					ticketId: input.ticketId,
					organizationId: context.activeMembership.organizationId,
					status: input.status,
				},
				db,
				getSupportActorContext(context),
			);
			return formatOperatorTicket(ticket);
		} catch (e) {
			return throwSupportNotFound(e);
		}
	}),

	updateTicketPriority: organizationPermissionProcedure({
		support: ["update"],
	}).support.updateTicketPriority.handler(async ({ context, input }) => {
		try {
			const ticket = await updateTicketPriority(
				{
					ticketId: input.ticketId,
					organizationId: context.activeMembership.organizationId,
					priority: input.priority,
				},
				db,
			);
			return formatOperatorTicket(ticket);
		} catch (e) {
			return throwSupportNotFound(e);
		}
	}),

	updateTicketDueAt: organizationPermissionProcedure({
		support: ["update"],
	}).support.updateTicketDueAt.handler(async ({ context, input }) => {
		try {
			const ticket = await updateTicketDueAt(
				{
					ticketId: input.ticketId,
					organizationId: context.activeMembership.organizationId,
					dueAt: input.dueAt ? new Date(input.dueAt) : null,
				},
				db,
			);
			return formatOperatorTicket(ticket);
		} catch (e) {
			return throwSupportNotFound(e);
		}
	}),

	listMyTickets: protectedProcedure.support.listMyTickets.handler(
		async ({ context, input }) => {
			const customerUserId = getRequiredSessionUserId(context);
			const result = await listCustomerTickets(
				customerUserId,
				{
					filter: input.filter,
					page: input.page,
					search: input.search,
					sort: input.sort,
				},
				db,
			);
			return {
				items: result.items.map(formatCustomerTicket),
				page: {
					limit: input.page.limit,
					offset: input.page.offset,
					total: result.total,
					hasMore: input.page.offset + result.items.length < result.total,
				},
			};
		},
	),

	getMyTicket: protectedProcedure.support.getMyTicket.handler(
		async ({ context, input }) => {
			const userId = getRequiredSessionUserId(context);
			try {
				const thread = await getCustomerTicketThread(
					input.ticketId,
					userId,
					db,
				);
				return {
					ticket: formatCustomerTicket(thread.ticket),
					messages: thread.messages.map(formatCustomerMessage),
				};
			} catch (e) {
				return throwSupportNotFound(e);
			}
		},
	),

	addMyMessage: protectedProcedure.support.addMyMessage.handler(
		async ({ context, input }) => {
			const userId = getRequiredSessionUserId(context);
			try {
				const message = await addCustomerTicketMessage(
					{
						ticketId: input.ticketId,
						customerUserId: userId,
						authorUserId: userId,
						body: input.body,
					},
					db,
					getSupportActorContext(context),
				);
				return formatCustomerMessage(message);
			} catch (e) {
				return throwSupportNotFound(e);
			}
		},
	),
};
