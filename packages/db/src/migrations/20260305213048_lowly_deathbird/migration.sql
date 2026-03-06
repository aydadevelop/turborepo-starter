ALTER TABLE "contaktly_conversation" ADD COLUMN "slots" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "contaktly_turn" ADD COLUMN "client_turn_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "contaktly_turn_clientTurnId_idx" ON "contaktly_turn" ("client_turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_turn_conversation_client_turn_unique" ON "contaktly_turn" ("conversation_id","client_turn_id");