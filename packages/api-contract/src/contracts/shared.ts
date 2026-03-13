import z from "zod";

export const successOutputSchema = z.object({ success: z.boolean() });

export const sortDirectionSchema = z.enum(["asc", "desc"]);

export const createOffsetPageInputSchema = ({
	defaultLimit = 20,
	maxLimit = 100,
}: {
	defaultLimit?: number;
	maxLimit?: number;
} = {}) =>
	z.object({
		limit: z.number().int().min(1).max(maxLimit).default(defaultLimit),
		offset: z.number().int().min(0).default(0),
	});

export const collectionPageSchema = z.object({
	limit: z.number().int().min(0),
	offset: z.number().int().min(0),
	total: z.number().int().min(0),
	hasMore: z.boolean(),
});

export const createCollectionOutputSchema = <T extends z.ZodTypeAny>(
	itemSchema: T,
) =>
	z.object({
		items: z.array(itemSchema),
		page: collectionPageSchema,
	});

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
