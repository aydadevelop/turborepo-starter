ALTER TABLE "notification_event" ALTER COLUMN "payload" SET DATA TYPE jsonb USING "payload"::jsonb;--> statement-breakpoint
ALTER TABLE "notification_in_app" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "notification_intent" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;