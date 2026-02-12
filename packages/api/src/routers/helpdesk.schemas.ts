import {
	supportMessageChannelValues,
	supportTicket,
	supportTicketMessage,
	supportTicketPriorityValues,
	supportTicketSourceValues,
	supportTicketStatusValues,
} from "@full-stack-cf-app/db/schema/support";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import { optionalTrimmedString } from "./shared/schema-utils";

// ── Output schemas ──

export const supportTicketOutputSchema = createSelectSchema(supportTicket);

export const supportTicketMessageOutputSchema =
	createSelectSchema(supportTicketMessage);

// ── Input schemas ──

export const supportTicketIdInputSchema = z.object({
	ticketId: z.string().trim().min(1),
});

export const createManagedSupportTicketInputSchema = z.object({
	bookingId: z.string().trim().min(1).optional(),
	customerUserId: z.string().trim().min(1).optional(),
	assignedToUserId: z.string().trim().min(1).optional(),
	source: z.enum(supportTicketSourceValues).default("manual"),
	priority: z.enum(supportTicketPriorityValues).default("normal"),
	subject: z.string().trim().min(1).max(200),
	description: optionalTrimmedString(10_000),
	dueAt: z.coerce.date().optional(),
	metadata: optionalTrimmedString(20_000),
});

export const listManagedSupportTicketsInputSchema = z.object({
	status: z.enum(supportTicketStatusValues).optional(),
	priority: z.enum(supportTicketPriorityValues).optional(),
	assignedToUserId: z.string().trim().min(1).optional(),
	search: optionalTrimmedString(120),
	limit: z.number().int().min(1).max(100).default(50),
});

export const getManagedSupportTicketInputSchema =
	supportTicketIdInputSchema.extend({
		includeMessages: z.boolean().default(true),
	});

export const assignManagedSupportTicketInputSchema =
	supportTicketIdInputSchema.extend({
		assignedToUserId: z.string().trim().min(1).optional(),
	});

export const updateManagedSupportTicketStatusInputSchema =
	supportTicketIdInputSchema.extend({
		status: z.enum(supportTicketStatusValues),
	});

export const createManagedSupportTicketMessageInputSchema =
	supportTicketIdInputSchema.extend({
		channel: z.enum(supportMessageChannelValues).default("internal"),
		body: z.string().trim().min(1).max(10_000),
		attachmentsJson: optionalTrimmedString(20_000),
		isInternal: z.boolean().default(true),
	});

export const listManagedSupportTicketMessagesInputSchema =
	supportTicketIdInputSchema.extend({
		limit: z.number().int().min(1).max(200).default(100),
	});
