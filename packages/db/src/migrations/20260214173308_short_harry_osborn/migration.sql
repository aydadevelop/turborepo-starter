CREATE TABLE `platform_fee_config` (
	`id` text PRIMARY KEY,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`affiliate_fee_percentage` integer DEFAULT 15 NOT NULL,
	`tax_percentage` integer DEFAULT 7 NOT NULL,
	`acquiring_fee_percentage` integer DEFAULT 5 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_platform_fee_config_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `boat_asset` ADD `expires_at` integer;--> statement-breakpoint
CREATE INDEX `platform_fee_config_currency_idx` ON `platform_fee_config` (`currency`);--> statement-breakpoint
CREATE INDEX `platform_fee_config_isActive_idx` ON `platform_fee_config` (`is_active`);