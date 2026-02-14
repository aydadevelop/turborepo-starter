import { db } from "@full-stack-cf-app/db";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import {
	supportTicket,
	supportTicketMessage,
} from "@full-stack-cf-app/db/schema/support";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNotNull,
	lte,
	sql,
} from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure } from "../index";
import { buildRecipients } from "../lib/event-bus";
import { insertAndReturn, requireManaged } from "../lib/db-helpers";
import {
	assignManagedSupportTicketInputSchema,
	createManagedSupportTicketInputSchema,
	createManagedSupportTicketMessageInputSchema,
	getManagedSupportTicketInputSchema,
	listManagedSupportTicketMessagesInputSchema,
	listManagedSupportTicketsInputSchema,
	sweepManagedSupportTicketSlaInputSchema,
	sweepManagedSupportTicketSlaOutputSchema,
	supportTicketMessageOutputSchema,
	supportTicketOutputSchema,
	updateManagedSupportTicketStatusInputSchema,
} from "./helpdesk.schemas";
import { requireSessionUserId } from "./shared/auth-utils";

const supportTicketSlaEscalationStatuses = [
	"open",
	"pending_customer",
	"pending_operator",
] as const;

const supportTicketNonTerminalStatuses = [
	...supportTicketSlaEscalationStatuses,
	"escalated",
] as const;

const supportTicketSlaHoursByPriority: Record<string, number> = {
	low: 48,
	normal: 24,
	high: 8,
	urgent: 2,
};

const computeDefaultSupportTicketDueAt = (params: {
	priority: string;
	createdAt: Date;
}) => {
	const hours = supportTicketSlaHoursByPriority[params.priority] ?? 24;
	return new Date(params.createdAt.getTime() + hours * 60 * 60 * 1000);
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
			const { activeMembership, eventBus } = context;
			const sessionUserId = requireSessionUserId(context);
			const createdAt = new Date();
			const dueAt =
				input.dueAt ??
				computeDefaultSupportTicketDueAt({
					priority: input.priority,
					createdAt,
				});

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
			const createdTicket = await insertAndReturn(supportTicket, {
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
				dueAt,
				metadata: input.metadata,
				createdAt,
				updatedAt: createdAt,
			});

			eventBus.emit({
				type: "support.ticket.created",
				organizationId: activeMembership.organizationId,
				actorUserId: sessionUserId,
				sourceType: "support_ticket",
				sourceId: ticketId,
				payload: {
					ticketId,
					subject: input.subject,
					source: input.source,
					priority: input.priority,
				},
				recipients: buildRecipients({
					userIds: [input.assignedToUserId, input.customerUserId],
					title: `New support ticket: ${input.subject}`,
					body: input.description ?? undefined,
					ctaUrl: `/dashboard/helpdesk/${ticketId}`,
					metadata: { ticketId, source: input.source, priority: input.priority },
				}),
			});

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
			const { activeMembership } = context;
			const where = and(
				eq(supportTicket.organizationId, activeMembership.organizationId),
				input.status ? eq(supportTicket.status, input.status) : undefined,
				input.priority ? eq(supportTicket.priority, input.priority) : undefined,
				input.assignedToUserId
					? eq(supportTicket.assignedToUserId, input.assignedToUserId)
					: undefined,
				input.overdueOnly
					? and(
							isNotNull(supportTicket.dueAt),
							lte(supportTicket.dueAt, new Date()),
							inArray(supportTicket.status, supportTicketNonTerminalStatuses)
						)
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

	ticketSlaSweepManaged: organizationPermissionProcedure({
		support: ["update"],
	})
		.route({
			tags: ["Helpdesk"],
			summary: "Escalate overdue support tickets",
			description:
				"Escalates overdue support tickets based on SLA due time and emits notification events for assignees/customers.",
		})
		.input(sweepManagedSupportTicketSlaInputSchema)
		.output(sweepManagedSupportTicketSlaOutputSchema)
		.handler(async ({ context, input }) => {
			const { activeMembership, eventBus } = context;
			const sessionUserId = requireSessionUserId(context);
			const now = input.now ?? new Date();

			const overdueTickets = await db
				.select()
				.from(supportTicket)
				.where(
					and(
						eq(supportTicket.organizationId, activeMembership.organizationId),
						inArray(
							supportTicket.status,
							supportTicketSlaEscalationStatuses
						),
						isNotNull(supportTicket.dueAt),
						lte(supportTicket.dueAt, now)
					)
				)
				.orderBy(asc(supportTicket.dueAt), asc(supportTicket.createdAt))
				.limit(input.limit);

			const escalatedTicketIds = overdueTickets.map((ticket) => ticket.id);
			if (!input.dryRun && escalatedTicketIds.length > 0) {
				await db
					.update(supportTicket)
					.set({
						status: "escalated",
						updatedAt: now,
					})
					.where(inArray(supportTicket.id, escalatedTicketIds));

				for (const ticket of overdueTickets) {
					eventBus.emit({
						type: "support.ticket.sla_escalated",
						organizationId: activeMembership.organizationId,
						actorUserId: sessionUserId,
						sourceType: "support_ticket",
						sourceId: ticket.id,
						payload: {
							ticketId: ticket.id,
							subject: ticket.subject,
							priority: ticket.priority,
							previousStatus: ticket.status,
							dueAt: ticket.dueAt?.toISOString() ?? null,
						},
						recipients: buildRecipients({
							userIds: [
								ticket.assignedToUserId,
								ticket.customerUserId,
								ticket.createdByUserId,
							],
							title: `Ticket escalated: ${ticket.subject}`,
							body: "SLA due time passed. Ticket needs immediate attention.",
							ctaUrl: `/dashboard/helpdesk/${ticket.id}`,
							severity: "warning",
							metadata: {
								ticketId: ticket.id,
								priority: ticket.priority,
								previousStatus: ticket.status,
								dueAt: ticket.dueAt?.toISOString() ?? null,
							},
						}),
					});
				}
			}

			return {
				now: now.toISOString(),
				dryRun: input.dryRun,
				scannedCount: overdueTickets.length,
				escalatedCount: input.dryRun ? 0 : overdueTickets.length,
				escalatedTicketIds,
			};
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
			const { activeMembership } = context;
			const managedTicket = await requireManaged(
				supportTicket,
				input.ticketId,
				activeMembership.organizationId
			);

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
			const { activeMembership } = context;
			const managedTicket = await requireManaged(
				supportTicket,
				input.ticketId,
				activeMembership.organizationId
			);

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
			const { activeMembership, eventBus } = context;
			const sessionUserId = requireSessionUserId(context);
			const managedTicket = await requireManaged(
				supportTicket,
				input.ticketId,
				activeMembership.organizationId
			);

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
				eventBus.emit({
					type: "support.ticket.status_changed",
					organizationId: activeMembership.organizationId,
					actorUserId: sessionUserId,
					sourceType: "support_ticket",
					sourceId: updatedTicket.id,
					payload: {
						ticketId: updatedTicket.id,
						subject: updatedTicket.subject,
						fromStatus: managedTicket.status,
						toStatus: updatedTicket.status,
						priority: updatedTicket.priority,
					},
					recipients: buildRecipients({
						userIds: [
							updatedTicket.assignedToUserId,
							updatedTicket.customerUserId,
							updatedTicket.createdByUserId,
						],
						title: `Ticket status: ${updatedTicket.status}`,
						body: `${updatedTicket.subject} (${managedTicket.status} -> ${updatedTicket.status})`,
						ctaUrl: `/dashboard/helpdesk/${updatedTicket.id}`,
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
					}),
				});
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
			const { activeMembership } = context;
			const sessionUserId = requireSessionUserId(context);
			const managedTicket = await requireManaged(
				supportTicket,
				input.ticketId,
				activeMembership.organizationId
			);

			const createdMessage = await insertAndReturn(supportTicketMessage, {
				id: crypto.randomUUID(),
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
						input.isInternal ||
						managedTicket.status === "resolved" ||
						managedTicket.status === "escalated"
							? managedTicket.status
							: "pending_operator",
					updatedAt: new Date(),
				})
				.where(eq(supportTicket.id, managedTicket.id));

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
			const { activeMembership } = context;
			await requireManaged(
				supportTicket,
				input.ticketId,
				activeMembership.organizationId
			);

			return db
				.select()
				.from(supportTicketMessage)
				.where(eq(supportTicketMessage.ticketId, input.ticketId))
				.orderBy(asc(supportTicketMessage.createdAt))
				.limit(input.limit);
		}),
};
