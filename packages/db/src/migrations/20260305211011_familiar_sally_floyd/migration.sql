CREATE TABLE "contaktly_conversation" (
	"id" text PRIMARY KEY,
	"config_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"last_widget_instance_id" text NOT NULL,
	"active_prompt_key" text DEFAULT 'goal' NOT NULL,
	"last_intent" text DEFAULT 'general' NOT NULL,
	"stage" text DEFAULT 'qualification' NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"messages" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contaktly_conversation_configId_idx" ON "contaktly_conversation" ("config_id");--> statement-breakpoint
CREATE INDEX "contaktly_conversation_visitorId_idx" ON "contaktly_conversation" ("visitor_id");--> statement-breakpoint
CREATE INDEX "contaktly_conversation_updatedAt_idx" ON "contaktly_conversation" ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_conversation_config_visitor_unique" ON "contaktly_conversation" ("config_id","visitor_id");