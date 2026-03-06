CREATE TABLE "contaktly_prefill_draft" (
	"id" text PRIMARY KEY,
	"public_config_id" text NOT NULL,
	"source_url" text NOT NULL,
	"site_title" text NOT NULL,
	"business_summary" text NOT NULL,
	"opening_message" text NOT NULL,
	"starter_cards" jsonb NOT NULL,
	"custom_instructions" text NOT NULL,
	"qualified_lead_definition" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contaktly_prefill_draft_publicConfigId_idx" ON "contaktly_prefill_draft" ("public_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_prefill_draft_publicConfigId_unique" ON "contaktly_prefill_draft" ("public_config_id");