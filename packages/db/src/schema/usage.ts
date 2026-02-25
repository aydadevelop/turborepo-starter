import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const usageOperationValues = [
	"embedding",
	"chat_completion",
	"audio_transcription",
	"nlp_extraction",
] as const;

export type UsageOperation = (typeof usageOperationValues)[number];

// ─── Usage Ledger ────────────────────────────────────────────────────────────
// Append-only ledger of metered AI operations for billing.
// Each row = one API call to an external model provider.

export const usageLedger = sqliteTable(
	"usage_ledger",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		operation: text("operation", { enum: usageOperationValues }).notNull(),
		/** Provider model identifier (e.g. "openai/gpt-5-nano:nitro", "text-embedding-3-small") */
		model: text("model").notNull(),
		/** Input tokens consumed (prompts, audio seconds × token rate, etc.) */
		inputTokens: integer("input_tokens").notNull().default(0),
		/** Output tokens generated */
		outputTokens: integer("output_tokens").notNull().default(0),
		/** Total tokens (convenience: inputTokens + outputTokens) */
		totalTokens: integer("total_tokens").notNull().default(0),
		/** Estimated cost in USD (micro-dollars for precision) */
		costMicrodollars: integer("cost_microdollars").notNull().default(0),
		/** Audio duration in seconds (for transcription operations) */
		audioDurationSeconds: real("audio_duration_seconds"),
		/** Contextual reference: which entity triggered this usage */
		resourceType: text("resource_type"),
		resourceId: text("resource_id"),
		/** Optional metadata (JSON) */
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		...timestamps,
	},
	(table) => [
		index("usage_ledger_org_idx").on(table.organizationId),
		index("usage_ledger_user_idx").on(table.userId),
		index("usage_ledger_operation_idx").on(table.operation),
		index("usage_ledger_created_idx").on(table.createdAt),
		index("usage_ledger_resource_idx").on(table.resourceType, table.resourceId),
	]
);
