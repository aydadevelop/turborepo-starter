import {
	inboundMessage,
	inboundMessageChannelValues,
	inboundMessageStatusValues,
} from "@full-stack-cf-app/db/schema/support";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import { optionalTrimmedString } from "./shared";

// ── Output schemas ──

export const inboundMessageOutputSchema = createSelectSchema(inboundMessage);

// ── Input schemas ──

export const inboundMessageIdInputSchema = z.object({
	inboundMessageId: z.string().trim().min(1),
});

export const ingestInboundMessageInputSchema = z.object({
	channel: z.enum(inboundMessageChannelValues),
	externalMessageId: z.string().trim().min(1).max(255),
	externalThreadId: optionalTrimmedString(255),
	externalSenderId: optionalTrimmedString(255),
	senderDisplayName: optionalTrimmedString(255),
	dedupeKey: optionalTrimmedString(255),
	text: optionalTrimmedString(20_000),
	payload: z.string().trim().min(2).max(200_000),
	ticketId: z.string().trim().min(1).optional(),
});

export const listManagedInboundMessagesInputSchema = z.object({
	channel: z.enum(inboundMessageChannelValues).optional(),
	status: z.enum(inboundMessageStatusValues).optional(),
	ticketId: z.string().trim().min(1).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const processManagedInboundMessageInputSchema =
	inboundMessageIdInputSchema.extend({
		status: z.enum(inboundMessageStatusValues),
		errorMessage: optionalTrimmedString(2000),
	});
