CREATE TABLE `calendar_webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`channel_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`message_number` integer,
	`resource_state` text NOT NULL,
	`channel_token` text,
	`resource_uri` text,
	`calendar_connection_id` text REFERENCES boat_calendar_connection(id) ON DELETE set null,
	`status` text DEFAULT 'processed' NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_provider_channel_idx` ON `calendar_webhook_event` (`provider`,`channel_id`);
--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_status_idx` ON `calendar_webhook_event` (`status`);
--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_connectionId_idx` ON `calendar_webhook_event` (`calendar_connection_id`);
--> statement-breakpoint
CREATE INDEX `calendar_webhook_event_receivedAt_idx` ON `calendar_webhook_event` (`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_webhook_event_provider_channel_message_unique` ON `calendar_webhook_event` (`provider`,`channel_id`,`message_number`);
