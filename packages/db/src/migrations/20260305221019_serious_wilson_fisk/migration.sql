CREATE TABLE "contaktly_workspace_config" (
	"id" text PRIMARY KEY,
	"public_config_id" text NOT NULL,
	"booking_url" text,
	"allowed_domains" jsonb,
	"bot_name" text,
	"opening_message" text,
	"starter_cards" jsonb,
	"theme" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contaktly_workspace_config_publicConfigId_idx" ON "contaktly_workspace_config" ("public_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_workspace_config_publicConfigId_unique" ON "contaktly_workspace_config" ("public_config_id");