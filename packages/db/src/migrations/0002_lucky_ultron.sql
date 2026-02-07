CREATE TABLE `boat` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`capacity` integer DEFAULT 1 NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `boat_organizationId_idx` ON `boat` (`organization_id`);--> statement-breakpoint
CREATE INDEX `boat_status_idx` ON `boat` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `boat_org_slug_unique` ON `boat` (`organization_id`,`slug`);