import { sql } from "drizzle-orm";
import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";

export const workflowStatusValues = ["running", "completed", "failed"] as const;
export const workflowStatusEnum = pgEnum("workflow_status", workflowStatusValues);

export const workflowStepStatusValues = ["running", "completed", "failed"] as const;
export const workflowStepStatusEnum = pgEnum("workflow_step_status", workflowStepStatusValues);

export const workflowExecution = pgTable("workflow_execution", {
	id: text("id")
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	workflowName: text("workflow_name").notNull(),
	idempotencyKey: text("idempotency_key").notNull().unique(),
	status: workflowStatusEnum("status").notNull().default("running"),
	inputSnapshot: jsonb("input_snapshot"),
	outputSnapshot: jsonb("output_snapshot"),
	error: text("error"),
	...timestamps,
	completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
});

export const workflowStepLog = pgTable(
	"workflow_step_log",
	{
		id: text("id")
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		executionId: text("execution_id")
			.notNull()
			.references(() => workflowExecution.id, { onDelete: "cascade" }),
		stepName: text("step_name").notNull(),
		status: workflowStepStatusEnum("status").notNull().default("running"),
		inputSnapshot: jsonb("input_snapshot"),
		outputSnapshot: jsonb("output_snapshot"),
		error: text("error"),
		startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		completedAt: timestamp("completed_at", {
			withTimezone: true,
			mode: "date",
		}),
	},
	(table) => [index("workflow_step_log_ix_execution_id").on(table.executionId)],
);
