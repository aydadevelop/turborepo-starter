CREATE TABLE "contaktly_calendar_connection" (
	"id" text PRIMARY KEY,
	"public_config_id" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"provider_account_id" text NOT NULL,
	"connected_user_id" text NOT NULL,
	"account_email" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contaktly_calendar_connection_publicConfigId_idx" ON "contaktly_calendar_connection" ("public_config_id");--> statement-breakpoint
CREATE INDEX "contaktly_calendar_connection_connectedUserId_idx" ON "contaktly_calendar_connection" ("connected_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_calendar_connection_publicConfigId_unique" ON "contaktly_calendar_connection" ("public_config_id");--> statement-breakpoint
ALTER TABLE "contaktly_calendar_connection" ADD CONSTRAINT "contaktly_calendar_connection_connected_user_id_user_id_fkey" FOREIGN KEY ("connected_user_id") REFERENCES "user"("id") ON DELETE CASCADE;