CREATE TABLE `booking_calendar_link` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`boat_calendar_connection_id` text,
	`provider` text DEFAULT 'manual' NOT NULL,
	`external_calendar_id` text,
	`external_event_id` text NOT NULL,
	`ical_uid` text,
	`external_event_version` text,
	`synced_at` integer,
	`sync_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boat_calendar_connection_id`) REFERENCES `boat_calendar_connection`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_calendar_link_bookingId_unique` ON `booking_calendar_link` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_calendar_link_connectionId_idx` ON `booking_calendar_link` (`boat_calendar_connection_id`);--> statement-breakpoint
CREATE INDEX `booking_calendar_link_provider_idx` ON `booking_calendar_link` (`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_calendar_link_provider_calendar_event_unique` ON `booking_calendar_link` (`provider`,`external_calendar_id`,`external_event_id`);--> statement-breakpoint
DROP INDEX `booking_org_externalRef_unique`;--> statement-breakpoint
ALTER TABLE `booking` ADD `calendar_sync_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX `booking_calendarSyncStatus_idx` ON `booking` (`calendar_sync_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_org_source_externalRef_unique` ON `booking` (`organization_id`,`source`,`external_ref`);