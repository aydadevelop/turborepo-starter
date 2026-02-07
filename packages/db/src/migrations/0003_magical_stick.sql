CREATE TABLE `boat_amenity` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`value` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boat_amenity_boatId_idx` ON `boat_amenity` (`boat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_amenity_boat_key_unique` ON `boat_amenity` (`boat_id`,`key`);--> statement-breakpoint
CREATE TABLE `boat_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`asset_type` text NOT NULL,
	`purpose` text DEFAULT 'gallery' NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text,
	`mime_type` text,
	`size_bytes` integer,
	`uploaded_by_user_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`review_note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `boat_asset_boatId_idx` ON `boat_asset` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_asset_purpose_idx` ON `boat_asset` (`purpose`);--> statement-breakpoint
CREATE INDEX `boat_asset_uploadedByUserId_idx` ON `boat_asset` (`uploaded_by_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_asset_boat_storageKey_unique` ON `boat_asset` (`boat_id`,`storage_key`);--> statement-breakpoint
CREATE TABLE `boat_availability_block` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`calendar_connection_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_ref` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`reason` text,
	`created_by_user_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calendar_connection_id`) REFERENCES `boat_calendar_connection`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `boat_availability_block_boatId_idx` ON `boat_availability_block` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_calendarConnectionId_idx` ON `boat_availability_block` (`calendar_connection_id`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_source_idx` ON `boat_availability_block` (`source`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_startsAt_idx` ON `boat_availability_block` (`starts_at`);--> statement-breakpoint
CREATE INDEX `boat_availability_block_endsAt_idx` ON `boat_availability_block` (`ends_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_availability_block_calendar_externalRef_unique` ON `boat_availability_block` (`calendar_connection_id`,`external_ref`);--> statement-breakpoint
CREATE TABLE `boat_availability_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boat_availability_rule_boatId_idx` ON `boat_availability_rule` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_availability_rule_dayOfWeek_idx` ON `boat_availability_rule` (`day_of_week`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_availability_rule_unique` ON `boat_availability_rule` (`boat_id`,`day_of_week`,`start_minute`,`end_minute`);--> statement-breakpoint
CREATE TABLE `boat_calendar_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`external_calendar_id` text NOT NULL,
	`sync_token` text,
	`watch_channel_id` text,
	`watch_resource_id` text,
	`watch_expires_at` integer,
	`last_synced_at` integer,
	`sync_status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boat_calendar_connection_boatId_idx` ON `boat_calendar_connection` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_calendar_connection_provider_idx` ON `boat_calendar_connection` (`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_calendar_connection_boat_provider_external_unique` ON `boat_calendar_connection` (`boat_id`,`provider`,`external_calendar_id`);--> statement-breakpoint
CREATE TABLE `boat_dock` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`address` text,
	`latitude` real,
	`longitude` real,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boat_dock_organizationId_idx` ON `boat_dock` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_dock_org_slug_unique` ON `boat_dock` (`organization_id`,`slug`);--> statement-breakpoint
CREATE TABLE `boat_pricing_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`base_hourly_price_cents` integer NOT NULL,
	`minimum_hours` integer DEFAULT 1 NOT NULL,
	`deposit_percentage` integer DEFAULT 0 NOT NULL,
	`service_fee_percentage` integer DEFAULT 0 NOT NULL,
	`affiliate_fee_percentage` integer DEFAULT 0 NOT NULL,
	`tax_percentage` integer DEFAULT 0 NOT NULL,
	`acquiring_fee_percentage` integer DEFAULT 0 NOT NULL,
	`valid_from` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`valid_to` integer,
	`is_default` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `boat_pricing_profile_boatId_idx` ON `boat_pricing_profile` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_pricing_profile_isDefault_idx` ON `boat_pricing_profile` (`is_default`);--> statement-breakpoint
CREATE INDEX `boat_pricing_profile_validFrom_idx` ON `boat_pricing_profile` (`valid_from`);--> statement-breakpoint
CREATE TABLE `boat_pricing_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`boat_id` text NOT NULL,
	`pricing_profile_id` text,
	`name` text NOT NULL,
	`rule_type` text NOT NULL,
	`condition_json` text DEFAULT '{}' NOT NULL,
	`adjustment_type` text NOT NULL,
	`adjustment_value` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`boat_id`) REFERENCES `boat`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pricing_profile_id`) REFERENCES `boat_pricing_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boat_pricing_rule_boatId_idx` ON `boat_pricing_rule` (`boat_id`);--> statement-breakpoint
CREATE INDEX `boat_pricing_rule_pricingProfileId_idx` ON `boat_pricing_rule` (`pricing_profile_id`);--> statement-breakpoint
CREATE INDEX `boat_pricing_rule_priority_idx` ON `boat_pricing_rule` (`priority`);--> statement-breakpoint
ALTER TABLE `boat` ADD `dock_id` text REFERENCES boat_dock(id);--> statement-breakpoint
ALTER TABLE `boat` ADD `type` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `passenger_capacity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `crew_capacity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `minimum_hours` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `minimum_notice_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `working_hours_start` integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `working_hours_end` integer DEFAULT 21 NOT NULL;--> statement-breakpoint
ALTER TABLE `boat` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `boat` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `boat` ADD `metadata` text;--> statement-breakpoint
CREATE INDEX `boat_dockId_idx` ON `boat` (`dock_id`);--> statement-breakpoint
ALTER TABLE `boat` DROP COLUMN `capacity`;