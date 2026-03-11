import { oc } from "@orpc/contract";
import z from "zod";

const supportTicketStatus = z.enum([
	"open",
	"pending_customer",
	"pending_operator",
	"escalated",
	"resolved",
	"closed",
]);
const supportTicketPriority = z.enum(["low", "normal", "high", "urgent"]);
const supportTicketSource = z.enum([
	"manual",
	"web",
	"telegram",
	"avito",
	"email",
	"api",
]);
const supportMessageChannel = z.enum([
	"internal",
	"web",
	"telegram",
	"avito",
	"email",
	"api",
]);

const attachmentOutput = z.object({
	name: z.string(),
	url: z.string(),
	mimeType: z.string().optional(),
});

const customerTicketOutput = z.object({
	id: z.string(),
	organizationId: z.string(),
	bookingId: z.string().nullable(),
	customerUserId: z.string().nullable(),
	subject: z.string(),
	description: z.string().nullable(),
	status: supportTicketStatus,
	priority: supportTicketPriority,
	source: supportTicketSource,
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const operatorTicketOutput = customerTicketOutput.extend({
	createdByUserId: z.string().nullable(),
	assignedToUserId: z.string().nullable(),
	resolvedByUserId: z.string().nullable(),
	closedByUserId: z.string().nullable(),
	dueAt: z.string().datetime().nullable(),
	resolvedAt: z.string().datetime().nullable(),
	closedAt: z.string().datetime().nullable(),
	metadata: z.record(z.string(), z.unknown()).nullable(),
});

const customerMessageOutput = z.object({
	id: z.string(),
	ticketId: z.string(),
	authorUserId: z.string().nullable(),
	channel: supportMessageChannel,
	body: z.string(),
	isInternal: z.boolean(),
	attachments: z.array(attachmentOutput).nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const operatorMessageOutput = customerMessageOutput.extend({
	inboundMessageId: z.string().nullable(),
});

const createTicketInputSchema = z.object({
	bookingId: z.string().optional(),
	customerUserId: z.string().optional(),
	subject: z.string().trim().min(1).max(500),
	description: z.string().trim().max(5000).optional(),
	priority: supportTicketPriority.optional(),
	source: supportTicketSource.optional(),
});

const addMessageInputSchema = z.object({
	ticketId: z.string().trim().min(1),
	channel: supportMessageChannel.optional(),
	body: z.string().trim().min(1).max(10_000),
	isInternal: z.boolean().optional(),
});

const getTicketInputSchema = z.object({
	ticketId: z.string().trim().min(1),
});

const listTicketsInputSchema = z.object({
	status: supportTicketStatus.optional(),
	priority: supportTicketPriority.optional(),
	source: supportTicketSource.optional(),
	bookingId: z.string().optional(),
	assignedToUserId: z.string().optional(),
	customerUserId: z.string().optional(),
	onlyUnassigned: z.boolean().optional(),
	onlyOverdue: z.boolean().optional(),
	limit: z.number().int().min(1).max(200).optional(),
	offset: z.number().int().min(0).optional(),
});

const assignTicketInputSchema = z.object({
	ticketId: z.string().trim().min(1),
	assignedToUserId: z.string().nullable(),
});

const updateTicketStatusInputSchema = z.object({
	ticketId: z.string().trim().min(1),
	status: supportTicketStatus,
});

const updateTicketPriorityInputSchema = z.object({
	ticketId: z.string().trim().min(1),
	priority: supportTicketPriority,
});

const updateTicketDueAtInputSchema = z.object({
	ticketId: z.string().trim().min(1),
	dueAt: z.string().datetime().nullable(),
});

export const supportContract = {
	createTicket: oc
		.route({
			tags: ["Support"],
			summary: "Create support ticket",
			description: "Open a new support ticket on behalf of the organization.",
		})
		.input(createTicketInputSchema)
		.output(operatorTicketOutput),

	addMessage: oc
		.route({
			tags: ["Support"],
			summary: "Add message to ticket",
			description: "Append a message to an existing support ticket.",
		})
		.input(addMessageInputSchema)
		.output(operatorMessageOutput),

	getTicket: oc
		.route({
			tags: ["Support"],
			summary: "Get ticket by ID",
			description:
				"Fetch a support ticket. Must belong to the active organization.",
		})
		.input(getTicketInputSchema)
		.output(operatorTicketOutput),

	listOrgTickets: oc
		.route({
			tags: ["Support"],
			summary: "List organization tickets",
			description:
				"Return paginated support tickets for the active organization.",
		})
		.input(listTicketsInputSchema)
		.output(z.array(operatorTicketOutput)),

	getTicketThread: oc
		.route({
			tags: ["Support"],
			summary: "Get operator ticket thread",
			description:
				"Fetch a support ticket thread for operators, including internal notes and inbound message links.",
		})
		.input(getTicketInputSchema)
		.output(
			z.object({
				ticket: operatorTicketOutput,
				messages: z.array(operatorMessageOutput),
			})
		),

	assignTicket: oc
		.route({
			tags: ["Support"],
			summary: "Assign or unassign a support ticket",
			description: "Assign a ticket to an operator or clear its assignment.",
		})
		.input(assignTicketInputSchema)
		.output(operatorTicketOutput),

	updateTicketStatus: oc
		.route({
			tags: ["Support"],
			summary: "Update support ticket status",
			description:
				"Update the ticket lifecycle status and maintain resolved/closed audit fields.",
		})
		.input(updateTicketStatusInputSchema)
		.output(operatorTicketOutput),

	updateTicketPriority: oc
		.route({
			tags: ["Support"],
			summary: "Update support ticket priority",
			description: "Adjust support ticket urgency for operator workflows.",
		})
		.input(updateTicketPriorityInputSchema)
		.output(operatorTicketOutput),

	updateTicketDueAt: oc
		.route({
			tags: ["Support"],
			summary: "Update support ticket due date",
			description:
				"Set or clear a support ticket due date for operational SLA handling.",
		})
		.input(updateTicketDueAtInputSchema)
		.output(operatorTicketOutput),

	listMyTickets: oc
		.route({
			tags: ["Support"],
			summary: "List the authenticated customer's own tickets",
			description:
				"Returns support tickets where the caller is the customerUserId. Scoped to the authenticated user only.",
		})
		.input(
			z.object({
				bookingId: z.string().optional(),
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().min(0).optional(),
			})
		)
		.output(z.array(customerTicketOutput)),

	getMyTicket: oc
		.route({
			tags: ["Support"],
			summary: "Get the caller's own ticket with messages",
			description:
				"Fetch a ticket where the caller is the customerUserId. Returns ticket metadata and non-internal messages.",
		})
		.input(z.object({ ticketId: z.string().trim().min(1) }))
		.output(
			z.object({
				ticket: customerTicketOutput,
				messages: z.array(customerMessageOutput),
			})
		),

	addMyMessage: oc
		.route({
			tags: ["Support"],
			summary: "Add a customer reply to their own ticket",
			description:
				"Append a customer-facing (non-internal) message to a ticket the caller owns.",
		})
		.input(
			z.object({
				ticketId: z.string().trim().min(1),
				body: z.string().trim().min(1).max(10_000),
			})
		)
		.output(customerMessageOutput),
};
