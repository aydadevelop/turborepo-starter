CREATE TABLE `support_ticket` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`booking_id` text REFERENCES booking(id) ON DELETE set null,
	`customer_user_id` text REFERENCES user(id) ON DELETE set null,
	`created_by_user_id` text REFERENCES user(id) ON DELETE set null,
	`assigned_to_user_id` text REFERENCES user(id) ON DELETE set null,
	`resolved_by_user_id` text REFERENCES user(id) ON DELETE set null,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`subject` text NOT NULL,
	`description` text,
	`due_at` integer,
	`resolved_at` integer,
	`closed_at` integer,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_ticket_organizationId_idx` ON `support_ticket` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `support_ticket_status_idx` ON `support_ticket` (`status`);
--> statement-breakpoint
CREATE INDEX `support_ticket_priority_idx` ON `support_ticket` (`priority`);
--> statement-breakpoint
CREATE INDEX `support_ticket_assignedToUserId_idx` ON `support_ticket` (`assigned_to_user_id`);
--> statement-breakpoint
CREATE INDEX `support_ticket_dueAt_idx` ON `support_ticket` (`due_at`);
--> statement-breakpoint
CREATE INDEX `support_ticket_bookingId_idx` ON `support_ticket` (`booking_id`);
--> statement-breakpoint
CREATE TABLE `support_ticket_message` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL REFERENCES support_ticket(id) ON DELETE cascade,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`author_user_id` text REFERENCES user(id) ON DELETE set null,
	`channel` text DEFAULT 'internal' NOT NULL,
	`body` text NOT NULL,
	`attachments_json` text,
	`is_internal` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_ticket_message_ticketId_idx` ON `support_ticket_message` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `support_ticket_message_organizationId_idx` ON `support_ticket_message` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `support_ticket_message_channel_idx` ON `support_ticket_message` (`channel`);
--> statement-breakpoint
CREATE INDEX `support_ticket_message_createdAt_idx` ON `support_ticket_message` (`created_at`);
--> statement-breakpoint
CREATE TABLE `inbound_message` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text REFERENCES organization(id) ON DELETE set null,
	`ticket_id` text REFERENCES support_ticket(id) ON DELETE set null,
	`channel` text NOT NULL,
	`external_message_id` text NOT NULL,
	`external_thread_id` text,
	`external_sender_id` text,
	`sender_display_name` text,
	`dedupe_key` text NOT NULL,
	`normalized_text` text,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbound_message_organizationId_idx` ON `inbound_message` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `inbound_message_ticketId_idx` ON `inbound_message` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `inbound_message_channel_idx` ON `inbound_message` (`channel`);
--> statement-breakpoint
CREATE INDEX `inbound_message_status_idx` ON `inbound_message` (`status`);
--> statement-breakpoint
CREATE INDEX `inbound_message_receivedAt_idx` ON `inbound_message` (`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_message_channel_dedupe_unique` ON `inbound_message` (`channel`,`dedupe_key`);
--> statement-breakpoint
CREATE TABLE `telegram_notification` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`ticket_id` text REFERENCES support_ticket(id) ON DELETE set null,
	`requested_by_user_id` text REFERENCES user(id) ON DELETE set null,
	`template_key` text NOT NULL,
	`recipient_chat_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`failure_reason` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telegram_notification_organizationId_idx` ON `telegram_notification` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `telegram_notification_ticketId_idx` ON `telegram_notification` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `telegram_notification_status_idx` ON `telegram_notification` (`status`);
--> statement-breakpoint
CREATE INDEX `telegram_notification_recipientChatId_idx` ON `telegram_notification` (`recipient_chat_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_notification_org_idempotency_unique` ON `telegram_notification` (`organization_id`,`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `telegram_webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text REFERENCES organization(id) ON DELETE set null,
	`inbound_message_id` text REFERENCES inbound_message(id) ON DELETE set null,
	`update_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`chat_id` text,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error_message` text,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_organizationId_idx` ON `telegram_webhook_event` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_inboundMessageId_idx` ON `telegram_webhook_event` (`inbound_message_id`);
--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_status_idx` ON `telegram_webhook_event` (`status`);
--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_chatId_idx` ON `telegram_webhook_event` (`chat_id`);
--> statement-breakpoint
CREATE INDEX `telegram_webhook_event_receivedAt_idx` ON `telegram_webhook_event` (`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_webhook_event_updateId_unique` ON `telegram_webhook_event` (`update_id`);
