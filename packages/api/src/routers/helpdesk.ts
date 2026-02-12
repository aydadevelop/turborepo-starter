import { db } from "@full-stack-cf-app/db";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import {
	supportTicket,
	supportTicketMessage,
} from "@full-stack-cf-app/db/schema/support";
import { notificationsPusher } from "@full-stack-cf-app/notifications/pusher";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../index";
import {
	assignManagedSupportTicketInputSchema,
	createManagedSupportTicketInputSchema,
	createManagedSupportTicketMessageInputSchema,
	getManagedSupportTicketInputSchema,
	listManagedSupportTicketMessagesInputSchema,
	listManagedSupportTicketsInputSchema,
	supportTicketMessageOutputSchema,
	supportTicketOutputSchema,
	updateManagedSupportTicketStatusInputSchema,
} from "./helpdesk.schemas";
import {
	requireActiveMembership,
	requireSessionUserId,
} from "./shared/auth-utils";

const requireManagedSupportTicket = async (params: {
	ticketId: string;
	organizationId: string;
}) => {
	const [managedTicket] = await db
		.select()
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.id, params.ticketId),
				eq(supportTicket.organizationId, params.organizationId)
			)
		)
		.limit(1);

	if (!managedTicket) {
		throw new ORPCError("NOT_FOUND");
	}

	return managedTicket;
};

export const helpdeskRouter = {
	ticketCreateManaged: organizationPermissionProcedure({
		support: ["create"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "Create support ticket",
			description: "Create a new support ticket for the organization.",
		})
		.input(createManagedSupportTicketInputSchema)
		.output(supportTicketOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);

			if (input.bookingId) {
				const [managedBooking] = await db
					.select({ id: booking.id })
					.from(booking)
					.where(
						and(
							eq(booking.id, input.bookingId),
							eq(booking.organizationId, activeMembership.organizationId)
						)
					)
					.limit(1);

				if (!managedBooking) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Booking is not available in the active organization",
					});
				}
			}

			const ticketId = crypto.randomUUID();
			await db.insert(supportTicket).values({
				id: ticketId,
				organizationId: activeMembership.organizationId,
				bookingId: input.bookingId,
				customerUserId: input.customerUserId,
				createdByUserId: sessionUserId,
				assignedToUserId: input.assignedToUserId,
				source: input.source,
				priority: input.priority,
				subject: input.subject,
				description: input.description,
				dueAt: input.dueAt,
				metadata: input.metadata,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdTicket] = await db
				.select()
				.from(supportTicket)
				.where(eq(supportTicket.id, ticketId))
				.limit(1);

			if (!createdTicket) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			const recipientUserIds = [
				input.assignedToUserId,
				input.customerUserId,
			].filter((value, index, array): value is string => {
				return Boolean(value) && array.indexOf(value) === index;
			});
			if (recipientUserIds.length > 0) {
				try {
					await notificationsPusher({
						input: {
							organizationId: activeMembership.organizationId,
							actorUserId: sessionUserId,
							eventType: "support.ticket.created",
							sourceType: "support_ticket",
							sourceId: ticketId,
							idempotencyKey: `support.ticket.created:${ticketId}`,
							payload: {
								recipients: recipientUserIds.map((userId) => ({
									userId,
									title: `New support ticket: ${input.subject}`,
									body: input.description ?? undefined,
									ctaUrl: `/dashboard/helpdesk/${ticketId}`,
									channels: ["in_app"],
									metadata: {
										ticketId,
										source: input.source,
										priority: input.priority,
									},
								})),
							},
						},
						queue: context.notificationQueue,
					});
				} catch (error) {
					console.error("Failed to emit support.ticket.created event", error);
				}
			}

			return createdTicket;
		}),

	ticketListManaged: organizationPermissionProcedure({
		support: ["read"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "List support tickets",
			description:
				"List support tickets with optional filters for status, priority, assignee, and search.",
		})
		.input(listManagedSupportTicketsInputSchema)
		.output(z.array(supportTicketOutputSchema))
		.handler(({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const where = and(
				eq(supportTicket.organizationId, activeMembership.organizationId),
				input.status ? eq(supportTicket.status, input.status) : undefined,
				input.priority ? eq(supportTicket.priority, input.priority) : undefined,
				input.assignedToUserId
					? eq(supportTicket.assignedToUserId, input.assignedToUserId)
					: undefined,
				input.search
					? sql`(lower(${supportTicket.subject}) like ${`%${input.search.toLowerCase()}%`} or lower(coalesce(${supportTicket.description}, '')) like ${`%${input.search.toLowerCase()}%`})`
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return db
				.select()
				.from(supportTicket)
				.where(where)
				.orderBy(desc(supportTicket.createdAt))
				.limit(input.limit);
		}),

	ticketGetManaged: organizationPermissionProcedure({
		support: ["read"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "Get support ticket",
			description:
				"Get a support ticket by ID, optionally including its messages.",
		})
		.input(getManagedSupportTicketInputSchema)
		.output(
			z.object({
				ticket: supportTicketOutputSchema,
				messages: z.array(supportTicketMessageOutputSchema),
			})
		)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedTicket = await requireManagedSupportTicket({
				ticketId: input.ticketId,
				organizationId: activeMembership.organizationId,
			});

			const messages = input.includeMessages
				? await db
						.select()
						.from(supportTicketMessage)
						.where(eq(supportTicketMessage.ticketId, managedTicket.id))
						.orderBy(asc(supportTicketMessage.createdAt))
						.limit(200)
				: [];

			return {
				ticket: managedTicket,
				messages,
			};
		}),

	ticketAssignManaged: organizationPermissionProcedure({
		support: ["update"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "Assign support ticket",
			description: "Assign or reassign a support ticket to a user.",
		})
		.input(assignManagedSupportTicketInputSchema)
		.output(supportTicketOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedTicket = await requireManagedSupportTicket({
				ticketId: input.ticketId,
				organizationId: activeMembership.organizationId,
			});

			await db
				.update(supportTicket)
				.set({
					assignedToUserId: input.assignedToUserId,
					updatedAt: new Date(),
				})
				.where(eq(supportTicket.id, managedTicket.id));

			const [updatedTicket] = await db
				.select()
				.from(supportTicket)
				.where(eq(supportTicket.id, managedTicket.id))
				.limit(1);

			if (!updatedTicket) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updatedTicket;
		}),

	ticketStatusManaged: organizationPermissionProcedure({
		support: ["update"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "Update ticket status",
			description:
				"Update a support ticket status with automatic tracking of resolution and closure.",
		})
		.input(updateManagedSupportTicketStatusInputSchema)
		.output(supportTicketOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedTicket = await requireManagedSupportTicket({
				ticketId: input.ticketId,
				organizationId: activeMembership.organizationId,
			});

			await db
				.update(supportTicket)
				.set({
					status: input.status,
					resolvedByUserId:
						input.status === "resolved" || input.status === "closed"
							? sessionUserId
							: managedTicket.resolvedByUserId,
					resolvedAt:
						input.status === "resolved" || input.status === "closed"
							? new Date()
							: managedTicket.resolvedAt,
					closedAt:
						input.status === "closed" ? new Date() : managedTicket.closedAt,
					updatedAt: new Date(),
				})
				.where(eq(supportTicket.id, managedTicket.id));

			const [updatedTicket] = await db
				.select()
				.from(supportTicket)
				.where(eq(supportTicket.id, managedTicket.id))
				.limit(1);

			if (!updatedTicket) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			if (managedTicket.status !== updatedTicket.status) {
				const recipientUserIds = [
					updatedTicket.assignedToUserId,
					updatedTicket.customerUserId,
					updatedTicket.createdByUserId,
				].filter((value, index, array): value is string => {
					return Boolean(value) && array.indexOf(value) === index;
				});

				if (recipientUserIds.length > 0) {
					try {
						await notificationsPusher({
							input: {
								organizationId: activeMembership.organizationId,
								actorUserId: sessionUserId,
								eventType: "support.ticket.status_changed",
								sourceType: "support_ticket",
								sourceId: updatedTicket.id,
								idempotencyKey: `support.ticket.status_changed:${updatedTicket.id}:${updatedTicket.updatedAt.toISOString()}`,
								payload: {
									recipients: recipientUserIds.map((userId) => ({
										userId,
										title: `Ticket status: ${updatedTicket.status}`,
										body: `${updatedTicket.subject} (${managedTicket.status} -> ${updatedTicket.status})`,
										ctaUrl: `/dashboard/helpdesk/${updatedTicket.id}`,
										channels: ["in_app"],
										severity:
											updatedTicket.status === "resolved" ||
											updatedTicket.status === "closed"
												? "success"
												: "info",
										metadata: {
											ticketId: updatedTicket.id,
											fromStatus: managedTicket.status,
											toStatus: updatedTicket.status,
											priority: updatedTicket.priority,
										},
									})),
								},
							},
							queue: context.notificationQueue,
						});
					} catch (error) {
						console.error(
							"Failed to emit support.ticket.status_changed event",
							error
						);
					}
				}
			}

			return updatedTicket;
		}),

	messageCreateManaged: organizationPermissionProcedure({
		support: ["update"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "Create ticket message",
			description:
				"Add a message to a support ticket. Internal messages do not change ticket status.",
		})
		.input(createManagedSupportTicketMessageInputSchema)
		.output(supportTicketMessageOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);
			const managedTicket = await requireManagedSupportTicket({
				ticketId: input.ticketId,
				organizationId: activeMembership.organizationId,
			});

			const messageId = crypto.randomUUID();
			await db.insert(supportTicketMessage).values({
				id: messageId,
				ticketId: managedTicket.id,
				organizationId: activeMembership.organizationId,
				authorUserId: sessionUserId,
				channel: input.channel,
				body: input.body,
				attachmentsJson: input.attachmentsJson,
				isInternal: input.isInternal,
				createdAt: new Date(),
			});

			await db
				.update(supportTicket)
				.set({
					status:
						input.isInternal || managedTicket.status === "resolved"
							? managedTicket.status
							: "pending_operator",
					updatedAt: new Date(),
				})
				.where(eq(supportTicket.id, managedTicket.id));

			const [createdMessage] = await db
				.select()
				.from(supportTicketMessage)
				.where(eq(supportTicketMessage.id, messageId))
				.limit(1);

			if (!createdMessage) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return createdMessage;
		}),

	messageListManaged: organizationPermissionProcedure({
		support: ["read"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "List ticket messages",
			description: "List messages for a support ticket in chronological order.",
		})
		.input(listManagedSupportTicketMessagesInputSchema)
		.output(z.array(supportTicketMessageOutputSchema))
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			await requireManagedSupportTicket({
				ticketId: input.ticketId,
				organizationId: activeMembership.organizationId,
			});

			return db
				.select()
				.from(supportTicketMessage)
				.where(eq(supportTicketMessage.ticketId, input.ticketId))
				.orderBy(asc(supportTicketMessage.createdAt))
				.limit(input.limit);
		}),
};
