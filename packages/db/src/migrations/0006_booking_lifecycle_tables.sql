CREATE TABLE `booking_cancellation_request` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text,
	`reason` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_cancellation_request_bookingId_unique` ON `booking_cancellation_request` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_cancellation_request_organizationId_idx` ON `booking_cancellation_request` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_cancellation_request_status_idx` ON `booking_cancellation_request` (`status`);--> statement-breakpoint
CREATE INDEX `booking_cancellation_request_requestedByUserId_idx` ON `booking_cancellation_request` (`requested_by_user_id`);--> statement-breakpoint
CREATE TABLE `booking_dispute` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`raised_by_user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`reason_code` text,
	`details` text,
	`resolution` text,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raised_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `booking_dispute_bookingId_idx` ON `booking_dispute` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_dispute_organizationId_idx` ON `booking_dispute` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_dispute_status_idx` ON `booking_dispute` (`status`);--> statement-breakpoint
CREATE INDEX `booking_dispute_raisedByUserId_idx` ON `booking_dispute` (`raised_by_user_id`);--> statement-breakpoint
CREATE TABLE `booking_refund` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by_user_id` text,
	`approved_by_user_id` text,
	`processed_by_user_id` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`reason` text,
	`provider` text,
	`external_refund_id` text,
	`failure_reason` text,
	`metadata` text,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`approved_at` integer,
	`processed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`processed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `booking_refund_bookingId_idx` ON `booking_refund` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_refund_organizationId_idx` ON `booking_refund` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_refund_status_idx` ON `booking_refund` (`status`);--> statement-breakpoint
CREATE INDEX `booking_refund_requestedByUserId_idx` ON `booking_refund` (`requested_by_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_refund_provider_externalRefundId_unique` ON `booking_refund` (`provider`,`external_refund_id`);
