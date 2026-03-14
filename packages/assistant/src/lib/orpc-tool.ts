import { tool } from "ai";
import { z } from "zod";

/**
 * Thin wrapper around the AI SDK `tool()` that pairs a contract Zod schema
 * with a description and execute function. For read-only operations.
 */
export function orpcTool<TSchema extends z.ZodType>(
	inputSchema: TSchema,
	description: string,
	execute: (input: z.infer<TSchema>) => Promise<unknown>,
) {
	return tool({ description, inputSchema, execute });
}

/**
 * Wraps any Zod schema with a preprocessor that coerces top-level null values
 * to undefined. LLMs routinely send `null` for optional fields they don't use;
 * Zod rejects null on `.optional()` (not `.nullable()`) fields before any
 * refinement runs, causing opaque "Error" tool failures.
 *
 * Use this around input schemas for AI SDK tools that accept optional fields.
 */
export function llmSafe<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess((raw) => {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			return raw;
		}
		return Object.fromEntries(
			Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
				k,
				v === null ? undefined : v,
			]),
		);
	}, schema);
}

/**
 * Like `orpcTool`, but marks the tool with `needsApproval: true` so the
 * AI SDK pauses before execution and the UI shows an Approve / Deny prompt.
 * Use for any write/mutation operations.
 */
export function orpcMutationTool<TSchema extends z.ZodType>(
	inputSchema: TSchema,
	description: string,
	execute: (input: z.infer<TSchema>) => Promise<unknown>,
) {
	return tool({ description, inputSchema, execute, needsApproval: true });
}
