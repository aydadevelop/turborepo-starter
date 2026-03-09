CREATE TYPE "workflow_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "workflow_step_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "workflow_execution" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_name" text NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"status" "workflow_status" DEFAULT 'running'::"workflow_status" NOT NULL,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_step_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" "workflow_step_status" DEFAULT 'running'::"workflow_step_status" NOT NULL,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workflow_step_log" ADD CONSTRAINT "workflow_step_log_execution_id_workflow_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_execution"("id") ON DELETE CASCADE;