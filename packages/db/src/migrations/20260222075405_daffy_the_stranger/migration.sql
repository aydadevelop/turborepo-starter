CREATE TABLE `usage_ledger` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`user_id` text,
	`operation` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost_microdollars` integer DEFAULT 0 NOT NULL,
	`audio_duration_seconds` real,
	`resource_type` text,
	`resource_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_usage_ledger_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_usage_ledger_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `usage_ledger_org_idx` ON `usage_ledger` (`organization_id`);--> statement-breakpoint
CREATE INDEX `usage_ledger_user_idx` ON `usage_ledger` (`user_id`);--> statement-breakpoint
CREATE INDEX `usage_ledger_operation_idx` ON `usage_ledger` (`operation`);--> statement-breakpoint
CREATE INDEX `usage_ledger_created_idx` ON `usage_ledger` (`created_at`);--> statement-breakpoint
CREATE INDEX `usage_ledger_resource_idx` ON `usage_ledger` (`resource_type`,`resource_id`);