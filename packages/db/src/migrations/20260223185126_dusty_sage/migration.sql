ALTER TABLE `yt_signal` ADD `severity_score` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_yt_feed` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`game_title` text NOT NULL,
	`search_query` text NOT NULL,
	`channel_id` text,
	`stop_words` text,
	`published_after` text,
	`game_version` text,
	`schedule_hint` text,
	`collect_categories` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_discovery_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_yt_feed_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_yt_feed`(`id`, `organization_id`, `name`, `game_title`, `search_query`, `channel_id`, `stop_words`, `published_after`, `game_version`, `schedule_hint`, `collect_categories`, `status`, `last_discovery_at`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `name`, `game_title`, `search_query`, `channel_id`, `stop_words`, `published_after`, `game_version`, `schedule_hint`, `collect_categories`, `status`, `last_discovery_at`, `created_at`, `updated_at` FROM `yt_feed`;--> statement-breakpoint
DROP TABLE `yt_feed`;--> statement-breakpoint
ALTER TABLE `__new_yt_feed` RENAME TO `yt_feed`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `yt_feed_org_idx` ON `yt_feed` (`organization_id`);--> statement-breakpoint
CREATE INDEX `yt_feed_status_idx` ON `yt_feed` (`status`);