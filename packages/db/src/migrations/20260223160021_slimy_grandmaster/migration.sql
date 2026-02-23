ALTER TABLE `yt_signal` ADD `start_offset` integer;--> statement-breakpoint
ALTER TABLE `yt_signal` ADD `end_offset` integer;--> statement-breakpoint
ALTER TABLE `yt_transcript` ADD `nlp_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `yt_transcript` ADD `marked_at` integer;