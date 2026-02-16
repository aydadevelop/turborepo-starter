ALTER TABLE `user` ADD `phone_number` text;--> statement-breakpoint
ALTER TABLE `user` ADD `phone_number_verified` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `telegram_id` text;--> statement-breakpoint
ALTER TABLE `user` ADD `telegram_username` text;--> statement-breakpoint
ALTER TABLE `account` ADD `telegram_id` text;--> statement-breakpoint
ALTER TABLE `account` ADD `telegram_username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_number_unique` ON `user` (`phone_number`);
