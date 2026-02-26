-- Add user_channel source mode to yt_feed.
-- SQLite stores enum values as plain text with no CHECK constraint,
-- so no DDL change is needed — this migration documents the new valid value.
-- user_channel: crawls all uploads from a creator channel (scopeChannelId required, no searchQuery).
SELECT 1;
