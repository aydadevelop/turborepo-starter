CREATE TABLE `notification_event` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`actor_user_id` text REFERENCES user(id) ON DELETE set null,
	`event_type` text NOT NULL,
	`source_type` text,
	`source_id` text,
	`idempotency_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`processing_started_at` integer,
	`processed_at` integer,
	`failure_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_event_organizationId_idx` ON `notification_event` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `notification_event_eventType_idx` ON `notification_event` (`event_type`);
--> statement-breakpoint
CREATE INDEX `notification_event_status_idx` ON `notification_event` (`status`);
--> statement-breakpoint
CREATE INDEX `notification_event_createdAt_idx` ON `notification_event` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_event_org_idempotency_unique` ON `notification_event` (`organization_id`,`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `notification_intent` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL REFERENCES notification_event(id) ON DELETE cascade,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`recipient_user_id` text REFERENCES user(id) ON DELETE set null,
	`channel` text NOT NULL,
	`template_key` text NOT NULL,
	`title` text,
	`body` text,
	`metadata` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_intent_eventId_idx` ON `notification_intent` (`event_id`);
--> statement-breakpoint
CREATE INDEX `notification_intent_organizationId_idx` ON `notification_intent` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `notification_intent_recipientUserId_idx` ON `notification_intent` (`recipient_user_id`);
--> statement-breakpoint
CREATE INDEX `notification_intent_channel_idx` ON `notification_intent` (`channel`);
--> statement-breakpoint
CREATE INDEX `notification_intent_status_idx` ON `notification_intent` (`status`);
--> statement-breakpoint
CREATE TABLE `notification_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL REFERENCES notification_intent(id) ON DELETE cascade,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`provider` text NOT NULL,
	`provider_recipient` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`failure_reason` text,
	`response_payload` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_delivery_intentId_idx` ON `notification_delivery` (`intent_id`);
--> statement-breakpoint
CREATE INDEX `notification_delivery_organizationId_idx` ON `notification_delivery` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `notification_delivery_provider_idx` ON `notification_delivery` (`provider`);
--> statement-breakpoint
CREATE INDEX `notification_delivery_status_idx` ON `notification_delivery` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_intent_attempt_unique` ON `notification_delivery` (`intent_id`,`attempt`);
--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade,
	`organization_id` text REFERENCES organization(id) ON DELETE set null,
	`organization_scope_key` text DEFAULT 'global' NOT NULL,
	`event_type` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`quiet_hours_start` integer,
	`quiet_hours_end` integer,
	`timezone` text,
	`created_by_user_id` text REFERENCES user(id) ON DELETE set null,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_preference_userId_idx` ON `notification_preference` (`user_id`);
--> statement-breakpoint
CREATE INDEX `notification_preference_organizationId_idx` ON `notification_preference` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `notification_preference_eventType_idx` ON `notification_preference` (`event_type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preference_scope_unique` ON `notification_preference` (`user_id`,`organization_scope_key`,`event_type`,`channel`);
--> statement-breakpoint
CREATE TABLE `notification_in_app` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text REFERENCES notification_event(id) ON DELETE set null,
	`intent_id` text REFERENCES notification_intent(id) ON DELETE set null,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade,
	`title` text NOT NULL,
	`body` text,
	`cta_url` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`metadata` text,
	`delivered_at` integer NOT NULL,
	`viewed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_in_app_eventId_idx` ON `notification_in_app` (`event_id`);
--> statement-breakpoint
CREATE INDEX `notification_in_app_intentId_idx` ON `notification_in_app` (`intent_id`);
--> statement-breakpoint
CREATE INDEX `notification_in_app_organizationId_idx` ON `notification_in_app` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `notification_in_app_userId_idx` ON `notification_in_app` (`user_id`);
--> statement-breakpoint
CREATE INDEX `notification_in_app_viewedAt_idx` ON `notification_in_app` (`viewed_at`);
--> statement-breakpoint
CREATE INDEX `notification_in_app_deliveredAt_idx` ON `notification_in_app` (`delivered_at`);
