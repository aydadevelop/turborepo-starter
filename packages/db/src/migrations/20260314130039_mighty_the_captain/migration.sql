CREATE TYPE "calendar_ingress_event_status" AS ENUM('received', 'accepted', 'duplicate', 'unmatched', 'missing_headers', 'unauthorized', 'adapter_not_configured', 'failed');--> statement-breakpoint
CREATE TABLE "calendar_ingress_event" (
	"id" text PRIMARY KEY,
	"organization_id" text,
	"calendar_connection_id" text,
	"calendar_webhook_event_id" text,
	"provider" "calendar_provider" NOT NULL,
	"route_path" text NOT NULL,
	"method" text NOT NULL,
	"host" text,
	"request_id" text,
	"trace_id" text,
	"remote_ip" text,
	"user_agent" text,
	"provider_channel_id" text,
	"provider_resource_id" text,
	"message_number" integer,
	"resource_state" text,
	"status" "calendar_ingress_event_status" DEFAULT 'received'::"calendar_ingress_event_status" NOT NULL,
	"response_code" integer,
	"error_message" text,
	"headers" jsonb,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "booking_discount_application_ix_discount_code_id_customer_user_id";--> statement-breakpoint
CREATE INDEX "calendar_ingress_event_ix_organization_id" ON "calendar_ingress_event" ("organization_id");--> statement-breakpoint
CREATE INDEX "calendar_ingress_event_ix_connection_id" ON "calendar_ingress_event" ("calendar_connection_id");--> statement-breakpoint
CREATE INDEX "calendar_ingress_event_ix_status" ON "calendar_ingress_event" ("status");--> statement-breakpoint
CREATE INDEX "calendar_ingress_event_ix_received_at" ON "calendar_ingress_event" ("received_at");--> statement-breakpoint
CREATE INDEX "booking_discount_application_ix_code_id_customer" ON "booking_discount_application" ("discount_code_id","customer_user_id");--> statement-breakpoint
ALTER TABLE "calendar_ingress_event" ADD CONSTRAINT "calendar_ingress_event_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "calendar_ingress_event" ADD CONSTRAINT "calendar_ingress_event_TuhUvfQh4PVK_fkey" FOREIGN KEY ("calendar_connection_id") REFERENCES "listing_calendar_connection"("id") ON DELETE SET NULL;