import z from "zod";

/**
 * Shared pagination input for admin list endpoints.
 * Provides limit/offset with sensible defaults.
 */
export const paginationInput = z.object({
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
});

/**
 * Wrap an item array schema with total count for paginated responses.
 */
export const paginatedOutput = <T extends z.ZodTypeAny>(itemSchema: T) =>
	z.object({
		items: z.array(itemSchema),
		total: z.number(),
	});
