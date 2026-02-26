import z from "zod";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

const schema = z.object({
	/** Feed display name, e.g. "CohhCarnage — All Videos" */
	name: z.string().trim().min(1).max(200),
	/** The game title to associate with this feed, e.g. "Baldur's Gate 3" */
	gameTitle: z.string().trim().min(1).max(200),
	/**
	 * YouTube channel ID of the creator / uploader (UC…).
	 * Use a channel where channelType="creator" from ytSearchChannels,
	 * or a channelId from ytSearchVideos topChannels.
	 * On first run, ALL videos from this channel are crawled (up to 1000).
	 * Subsequent runs fetch the latest 50 uploads.
	 */
	scopeChannelId: z
		.string()
		.trim()
		.regex(/^UC[\w-]{22}$/, "Must be a YouTube channel ID starting with UC"),
	/** Display name of the creator channel, e.g. "CohhCarnage" */
	scopeChannelName: z.string().trim().min(1).max(200),
	/** Comma-separated words to filter out by video title after discovery. */
	titleStopWords: z.string().trim().max(2000).optional(),
	/**
	 * Exclude videos shorter than N seconds. e.g. 60 to skip Shorts, 300 to skip trailers.
	 * Optional — omit to allow all durations.
	 */
	minDurationSeconds: z.number().int().min(1).max(86_400).optional(),
	gameVersion: z.string().trim().max(50).optional(),
});

export const createCreateFeedChannelAllTool = (client: AppRouterClient) =>
	orpcMutationTool(
		llmSafe(schema),
		[
			"Create a discovery feed that indexes ALL uploads from a specific creator's YouTube channel.",
			"",
			"Uses sourceMode=user_channel: first run crawls up to 1000 videos, subsequent runs fetch the latest 50.",
			"Use this when you want full coverage of a creator's catalogue — no query filter applied.",
			"For filtering by game keyword within a channel, use ytCreateFeedChannelQuery instead.",
			"",
			"How to get scopeChannelId:",
			"  - ytSearchVideos topChannels field lists creator channelIds from search results.",
			"  - ytSearchChannels returns channelId + channelType; use channelType='creator' channels only.",
			"  - Do NOT use a 'topic' channel here — use ytCreateFeedGameChannel for those.",
			"",
			"After creating, call ytTriggerDiscovery to start the first scan.",
		].join("\n"),
		async (input) => {
			const feed = await client.youtube.feeds.create({
				...input,
				sourceMode: "user_channel",
			});
			return {
				id: feed.id,
				name: feed.name,
				gameTitle: feed.gameTitle,
				sourceMode: feed.sourceMode,
				scopeChannelId: feed.scopeChannelId,
				scopeChannelName: feed.scopeChannelName,
				titleStopWords: feed.titleStopWords,
				status: feed.status,
				createdAt: feed.createdAt,
			};
		},
	);
