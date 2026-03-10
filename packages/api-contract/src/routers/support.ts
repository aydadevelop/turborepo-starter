import { oc } from "@orpc/contract";
import z from "zod";

const ticketOutput = z.object({
	id: z.string(),
	organizationId: z.string(),
	bookingId: z.string().nullable(),
	customerUserId: z.string().nullable(),
	createdByUserId: z.string().nullable(),
	subject: z.string(),
	description: z.string().nullable(),
	status: z.enum([
		"open",
		"pending_customer",
		"pending_operator",
		"escalated",
		"resolved",
		"closed",
	]),
	priority: z.enum(["low", "normal", "high", "urgent"]),
	source: z.enum(["manual", "web", "telegram", "avito", "email", "api"]),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const messageOutput = z.object({
	id: z.string(),
	ticketId: z.string(),
	authorUserId: z.string().nullable(),
	channel: z.enum(["internal", "web", "telegram", "avito", "email", "api"]),
	body: z.string(),
	isInternal: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const createTicketInputSchema = z.object({
	bookingId: z.string().optional(),
	customerUserId: z.string().optional(),
	subject: z.string().trim().min(1).max(500),
	description: z.string().trim().max(5000).optional(),
	priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
	source: z
		.enum(["manual", "web", "telegram", "avito", "email", "api"])
		.optional(),
});

const addMessageInputSchema = z.object({
	ticketId: z.string().trim().min(1),
	channel: z
		.enum(["internal", "web", "telegram", "avito", "email", "api"])
		.optional(),
	body: z.string().trim().min(1).max(10_000),
	isInternal: z.boolean().optional(),
});

const getTicketInputSchema = z.object({
	ticketId: z.string().trim().min(1),
});

const listTicketsInputSchema = z.object({
	status: z
		.enum([
			"open",
			"pending_customer",
			"pending_operator",
			"escalated",
			"resolved",
			"closed",
		])
		.optional(),
	bookingId: z.string().optional(),
	limit: z.number().int().min(1).max(200).optional(),
	offset: z.number().int().min(0).optional(),
});

export const supportContract = {
	createTicket: oc
		.route({
			tags: ["Support"],
			summary: "Create support ticket",
			description: "Open a new support ticket on behalf of the organization.",
		})
		.input(createTicketInputSchema)
		.output(ticketOutput),

	addMessage: oc
		.route({
			tags: ["Support"],
			summary: "Add message to ticket",
			description: "Append a message to an existing support ticket.",
		})
		.input(addMessageInputSchema)
		.output(messageOutput),

	getTicket: oc
		.route({
			tags: ["Support"],
			summary: "Get ticket by ID",
			description: "Fetch a support ticket. Must belong to the active organization.",
		})
		.input(getTicketInputSchema)
		.output(ticketOutput),

	listOrgTickets: oc
		.route({
			tags: ["Support"],
			summary: "List organization tickets",
			description: "Return paginated support tickets for the active organization.",
		})
		.input(listTicketsInputSchema)
		.output(z.array(ticketOutput)),

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
			}),
		)
		.output(z.array(ticketOutput)),

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
				ticket: ticketOutput,
				messages: z.array(messageOutput),
			}),
		),

	addMyMessage: oc
		.route({
			tags: ["Support"],
			summary: "Add a customer reply to their own ticket",
			description: "Append a customer-facing (non-internal) message to a ticket the caller owns.",
		})
		.input(
			z.object({
				ticketId: z.string().trim().min(1),
				body: z.string().trim().min(1).max(10_000),
			}),
		)
		.output(messageOutput),
};
