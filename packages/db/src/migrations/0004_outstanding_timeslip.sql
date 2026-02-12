CREATE TABLE `booking` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`boat_id` text NOT NULL,
	`customer_user_id` text,
	`created_by_user_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`passengers` integer DEFAULT 1 NOT NULL,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`base_price_cents` integer DEFAULT 0 NOT NULL,
	`discount_amount_cents` integer DEFAULT 0 NOT NULL,
	`total_price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`notes` text,
	`special_requests` text,
	`external_ref` text,
	`cancelled_at` integer,
	`cancelled_by_user_id` text,
	`cancellation_reason` text,
	`refund_amount_cents` integer,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `booking_organizationId_idx` ON `booking` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_boatId_idx` ON `booking` (`boat_id`);--> statement-breakpoint
CREATE INDEX `booking_status_idx` ON `booking` (`status`);--> statement-breakpoint
CREATE INDEX `booking_paymentStatus_idx` ON `booking` (`payment_status`);--> statement-breakpoint
CREATE INDEX `booking_startsAt_idx` ON `booking` (`starts_at`);--> statement-breakpoint
CREATE INDEX `booking_endsAt_idx` ON `booking` (`ends_at`);--> statement-breakpoint
CREATE INDEX `booking_customerUserId_idx` ON `booking` (`customer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_org_externalRef_unique` ON `booking` (`organization_id`,`external_ref`);--> statement-breakpoint
CREATE TABLE `booking_discount_application` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`discount_code_id` text,
	`code` text NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`applied_amount_cents` integer NOT NULL,
	`applied_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`discount_code_id`) REFERENCES `booking_discount_code`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `booking_discount_application_discountCodeId_idx` ON `booking_discount_application` (`discount_code_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_discount_application_bookingId_unique` ON `booking_discount_application` (`booking_id`);--> statement-breakpoint
CREATE TABLE `booking_discount_code` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`max_discount_cents` integer,
	`minimum_subtotal_cents` integer DEFAULT 0 NOT NULL,
	`valid_from` integer,
	`valid_to` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`per_customer_limit` integer,
	`applies_to_boat_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_user_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applies_to_boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `booking_discount_code_organizationId_idx` ON `booking_discount_code` (`organization_id`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_isActive_idx` ON `booking_discount_code` (`is_active`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_validFrom_idx` ON `booking_discount_code` (`valid_from`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_validTo_idx` ON `booking_discount_code` (`valid_to`);--> statement-breakpoint
CREATE INDEX `booking_discount_code_appliesToBoatId_idx` ON `booking_discount_code` (`applies_to_boat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_discount_code_org_code_unique` ON `booking_discount_code` (`organization_id`,`code`);
