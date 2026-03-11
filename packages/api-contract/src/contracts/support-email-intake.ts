import { z } from "zod";

const supportEmailIntakeAddressSchema = z.object({
	address: z.string().trim().email(),
	name: z.string().trim().optional(),
});

const supportEmailIntakeAttachmentSchema = z.object({
	contentType: z.string().trim().optional(),
	disposition: z.string().trim().optional(),
	filename: z.string().trim().optional(),
	size: z.number().int().nonnegative().optional(),
});

export const supportEmailIntakePayloadSchema = z.object({
	attachments: z.array(supportEmailIntakeAttachmentSchema).default([]),
	date: z.string().trim().optional(),
	from: supportEmailIntakeAddressSchema,
	headers: z.record(z.string(), z.array(z.string())).default({}),
	html: z.string().optional(),
	inReplyTo: z.string().trim().optional(),
	messageId: z.string().trim().min(1),
	references: z.array(z.string().trim().min(1)).default([]),
	subject: z.string().trim().optional(),
	text: z.string().optional(),
	to: z.array(supportEmailIntakeAddressSchema).min(1),
});

export type SupportEmailIntakePayload = z.infer<
	typeof supportEmailIntakePayloadSchema
>;
