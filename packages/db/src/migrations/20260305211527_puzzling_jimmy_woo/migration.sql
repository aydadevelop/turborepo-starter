CREATE TABLE "contaktly_message" (
	"id" text PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"turn_id" text,
	"message_order" integer NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"intent" text,
	"prompt_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contaktly_turn" (
	"id" text PRIMARY KEY,
	"conversation_id" text NOT NULL,
	"state_version_before" integer NOT NULL,
	"state_version_after" integer NOT NULL,
	"user_input" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contaktly_conversation" ADD COLUMN "next_message_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "contaktly_message_conversationId_idx" ON "contaktly_message" ("conversation_id");--> statement-breakpoint
CREATE INDEX "contaktly_message_turnId_idx" ON "contaktly_message" ("turn_id");--> statement-breakpoint
CREATE INDEX "contaktly_message_order_idx" ON "contaktly_message" ("conversation_id","message_order");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_message_conversation_order_unique" ON "contaktly_message" ("conversation_id","message_order");--> statement-breakpoint
CREATE INDEX "contaktly_turn_conversationId_idx" ON "contaktly_turn" ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_turn_conversation_state_after_unique" ON "contaktly_turn" ("conversation_id","state_version_after");--> statement-breakpoint
ALTER TABLE "contaktly_message" ADD CONSTRAINT "contaktly_message_JnV8aiy1jWNp_fkey" FOREIGN KEY ("conversation_id") REFERENCES "contaktly_conversation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contaktly_message" ADD CONSTRAINT "contaktly_message_turn_id_contaktly_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "contaktly_turn"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "contaktly_turn" ADD CONSTRAINT "contaktly_turn_conversation_id_contaktly_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "contaktly_conversation"("id") ON DELETE CASCADE;