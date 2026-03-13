import z from "zod";
import { createOffsetPageInputSchema } from "../../contracts/shared";

export const paginationInput = createOffsetPageInputSchema({
	defaultLimit: 50,
	maxLimit: 100,
});

export const paginatedOutput = <T extends z.ZodTypeAny>(itemSchema: T) =>
	z.object({
		items: z.array(itemSchema),
		total: z.number(),
	});

export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullable(),
	metadata: z.string().nullable(),
	createdAt: z.coerce.date(),
});

export const memberSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string(),
	role: z.string(),
	createdAt: z.coerce.date(),
});

export const invitationSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	email: z.string(),
	role: z.string().nullable(),
	status: z.string(),
	expiresAt: z.coerce.date(),
	inviterId: z.string(),
	createdAt: z.coerce.date(),
});

export const userSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	image: z.string().nullable(),
	phoneNumber: z.string().nullable(),
	phoneNumberVerified: z.boolean().nullable(),
	telegramId: z.string().nullable(),
	telegramUsername: z.string().nullable(),
	role: z.string().nullable(),
	isAnonymous: z.boolean().nullable(),
	banned: z.boolean().nullable(),
	banReason: z.string().nullable(),
	banExpires: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
