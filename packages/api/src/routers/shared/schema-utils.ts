import z from "zod";

export const optionalTrimmedString = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((value) => (value && value.length > 0 ? value : undefined));

export const successOutputSchema = z.object({ success: z.boolean() });
