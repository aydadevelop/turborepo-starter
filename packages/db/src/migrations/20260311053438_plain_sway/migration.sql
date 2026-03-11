CREATE INDEX "listing_availability_block_ix_calendar_connection_id" ON "listing_availability_block" ("calendar_connection_id");--> statement-breakpoint
CREATE INDEX "organization_payment_config_ix_provider_config_id" ON "organization_payment_config" ("provider_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_event_uq_request_signature" ON "payment_webhook_event" ("request_signature") WHERE "request_signature" is not null;--> statement-breakpoint
CREATE INDEX "listing_publication_ix_merchant_payment_config_id" ON "listing_publication" ("merchant_payment_config_id");--> statement-breakpoint
CREATE INDEX "listing_publication_ix_pricing_profile_id" ON "listing_publication" ("pricing_profile_id");--> statement-breakpoint
CREATE INDEX "booking_ix_publication_id" ON "booking" ("publication_id");--> statement-breakpoint
CREATE INDEX "booking_ix_merchant_organization_id" ON "booking" ("merchant_organization_id");--> statement-breakpoint
CREATE INDEX "booking_ix_merchant_payment_config_id" ON "booking" ("merchant_payment_config_id");--> statement-breakpoint
CREATE INDEX "support_ticket_message_ix_inbound_message_id" ON "support_ticket_message" ("inbound_message_id");--> statement-breakpoint
CREATE INDEX "workflow_step_log_ix_execution_id" ON "workflow_step_log" ("execution_id");