import z from "zod";

export const successOutputSchema = z.object({ success: z.boolean() });

export const optionalTrimmedString = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((value) => (value && value.length > 0 ? value : undefined));

export const dateStringSchema = z
	.string()
	.datetime()
	.or(z.coerce.date().transform((value) => value.toISOString()));
