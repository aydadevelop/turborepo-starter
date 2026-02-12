CREATE TABLE `booking_payment_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL REFERENCES booking(id) ON DELETE cascade,
	`organization_id` text NOT NULL REFERENCES organization(id) ON DELETE cascade,
	`requested_by_user_id` text REFERENCES user(id) ON DELETE set null,
	`provider` text DEFAULT 'manual' NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_intent_id` text,
	`status` text DEFAULT 'initiated' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`failure_reason` text,
	`metadata` text,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_bookingId_idx` ON `booking_payment_attempt` (`booking_id`);
--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_organizationId_idx` ON `booking_payment_attempt` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_status_idx` ON `booking_payment_attempt` (`status`);
--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_provider_idx` ON `booking_payment_attempt` (`provider`);
--> statement-breakpoint
CREATE INDEX `booking_payment_attempt_requestedByUserId_idx` ON `booking_payment_attempt` (`requested_by_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_payment_attempt_booking_idempotency_unique` ON `booking_payment_attempt` (`booking_id`,`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_payment_attempt_provider_intent_unique` ON `booking_payment_attempt` (`provider`,`provider_intent_id`);
