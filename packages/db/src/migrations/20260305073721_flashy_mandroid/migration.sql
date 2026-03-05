CREATE TABLE "assistant_chat" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"user_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_message" (
	"id" text PRIMARY KEY,
	"chat_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"telegram_id" text,
	"telegram_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" text NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"active_organization_id" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text UNIQUE,
	"phone_number_verified" boolean DEFAULT false,
	"telegram_id" text,
	"telegram_username" text,
	"role" text DEFAULT 'user',
	"is_anonymous" boolean DEFAULT false,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consent" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"consent_type" text NOT NULL,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" text PRIMARY KEY,
	"intent_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_recipient" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"response_payload" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_event" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"event_type" text NOT NULL,
	"source_type" text,
	"source_id" text,
	"idempotency_key" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_in_app" (
	"id" text PRIMARY KEY,
	"event_id" text,
	"intent_id" text,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"cta_url" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"metadata" text,
	"delivered_at" timestamp with time zone NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_intent" (
	"id" text PRIMARY KEY,
	"event_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"recipient_user_id" text,
	"channel" text NOT NULL,
	"template_key" text NOT NULL,
	"title" text,
	"body" text,
	"metadata" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"organization_id" text,
	"organization_scope_key" text DEFAULT 'global' NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" integer,
	"quiet_hours_end" integer,
	"timezone" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" serial PRIMARY KEY,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "assistant_chat_user_idx" ON "assistant_chat" ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_message_chat_idx" ON "assistant_message" ("chat_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");--> statement-breakpoint
CREATE INDEX "invitation_status_idx" ON "invitation" ("status");--> statement-breakpoint
CREATE INDEX "invitation_inviterId_idx" ON "invitation" ("inviter_id");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" ("slug");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_id_unique" ON "passkey" ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "user_consent_userId_idx" ON "user_consent" ("user_id");--> statement-breakpoint
CREATE INDEX "user_consent_type_idx" ON "user_consent" ("user_id","consent_type");--> statement-breakpoint
CREATE INDEX "notification_delivery_intentId_idx" ON "notification_delivery" ("intent_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_organizationId_idx" ON "notification_delivery" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_provider_idx" ON "notification_delivery" ("provider");--> statement-breakpoint
CREATE INDEX "notification_delivery_status_idx" ON "notification_delivery" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_intent_attempt_unique" ON "notification_delivery" ("intent_id","attempt");--> statement-breakpoint
CREATE INDEX "notification_event_organizationId_idx" ON "notification_event" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_event_eventType_idx" ON "notification_event" ("event_type");--> statement-breakpoint
CREATE INDEX "notification_event_status_idx" ON "notification_event" ("status");--> statement-breakpoint
CREATE INDEX "notification_event_createdAt_idx" ON "notification_event" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_org_idempotency_unique" ON "notification_event" ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_in_app_eventId_idx" ON "notification_in_app" ("event_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_intentId_idx" ON "notification_in_app" ("intent_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_organizationId_idx" ON "notification_in_app" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_userId_idx" ON "notification_in_app" ("user_id");--> statement-breakpoint
CREATE INDEX "notification_in_app_viewedAt_idx" ON "notification_in_app" ("viewed_at");--> statement-breakpoint
CREATE INDEX "notification_in_app_deliveredAt_idx" ON "notification_in_app" ("delivered_at");--> statement-breakpoint
CREATE INDEX "notification_intent_eventId_idx" ON "notification_intent" ("event_id");--> statement-breakpoint
CREATE INDEX "notification_intent_organizationId_idx" ON "notification_intent" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_intent_recipientUserId_idx" ON "notification_intent" ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "notification_intent_channel_idx" ON "notification_intent" ("channel");--> statement-breakpoint
CREATE INDEX "notification_intent_status_idx" ON "notification_intent" ("status");--> statement-breakpoint
CREATE INDEX "notification_preference_userId_idx" ON "notification_preference" ("user_id");--> statement-breakpoint
CREATE INDEX "notification_preference_organizationId_idx" ON "notification_preference" ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_preference_eventType_idx" ON "notification_preference" ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_scope_unique" ON "notification_preference" ("user_id","organization_scope_key","event_type","channel");--> statement-breakpoint
ALTER TABLE "assistant_chat" ADD CONSTRAINT "assistant_chat_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_chat_id_assistant_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "assistant_chat"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_consent" ADD CONSTRAINT "user_consent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_intent_id_notification_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "notification_intent"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_event_id_notification_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_event"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_intent_id_notification_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "notification_intent"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_in_app" ADD CONSTRAINT "notification_in_app_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_event_id_notification_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_event"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_intent" ADD CONSTRAINT "notification_intent_recipient_user_id_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;