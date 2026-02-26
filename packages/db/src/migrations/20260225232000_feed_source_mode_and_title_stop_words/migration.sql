ALTER TABLE `yt_feed` ADD COLUMN `source_mode` text DEFAULT 'search' NOT NULL;
--> statement-breakpoint
ALTER TABLE `yt_feed` ADD COLUMN `title_stop_words` text;
--> statement-breakpoint
UPDATE `yt_feed`
SET `source_mode` = CASE
	WHEN `playlist_id` IS NOT NULL AND length(trim(`playlist_id`)) > 0 THEN 'playlist'
	WHEN `scope_channel_id` IS NOT NULL
		AND length(trim(`scope_channel_id`)) > 0
		AND length(trim(`search_query`)) > 0 THEN 'user_channel_query'
	WHEN `scope_channel_id` IS NOT NULL AND length(trim(`scope_channel_id`)) > 0 THEN 'game_channel'
	ELSE 'search'
END;
