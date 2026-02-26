import z from "zod";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

const schema = z.object({
	/** Feed display name, e.g. "Northernlion — Binding of Isaac" */
	name: z.string().trim().min(1).max(200),
	/** The game title to associate with this feed, e.g. "The Binding of Isaac: Repentance" */
	gameTitle: z.string().trim().min(1).max(200),
	/**
	 * YouTube channel ID of the creator / uploader (UC…).
	 * Use a channel where channelType="creator" from ytSearchChannels,
	 * or a channelId from ytSearchVideos topChannels.
	 * Do NOT use a topic channel here — those have no original uploads.
	 */
	scopeChannelId: z
		.string()
		.trim()
		.regex(/^UC[\w-]{22}$/, "Must be a YouTube channel ID starting with UC"),
	/** Display name of the creator channel, e.g. "Northernlion" */
	scopeChannelName: z.string().trim().min(1).max(200),
	/**
	 * Search query scoped to this channel's uploads, e.g. "binding of isaac".
	 * Only videos from this channel matching the query are discovered.
	 */
	searchQuery: z.string().trim().min(1).max(500),
	/**
	 * Exclude videos shorter than N seconds. e.g. 60 to skip Shorts, 300 to skip trailers.
	 * Optional — omit to allow all durations.
	 */
	minDurationSeconds: z.number().int().min(1).max(86_400).optional(),
	/** Comma-separated words to filter out by video title after discovery. */
	titleStopWords: z.string().trim().max(2000).optional(),
	gameVersion: z.string().trim().max(50).optional(),
});

export const createCreateFeedChannelQueryTool = (client: AppRouterClient) =>
	orpcMutationTool(
		llmSafe(schema),
		[
			"Create a discovery feed that searches a specific creator's YouTube channel for videos about a game.",
			"",
			"Uses sourceMode=user_channel_query: scans uploads from scopeChannelId filtered by searchQuery.",
			"Great for following a specific streamer or YouTuber's coverage of a game.",
			"",
			"How to get scopeChannelId:",
			"  - ytSearchVideos topChannels field lists creator channelIds from search results.",
			"  - ytSearchChannels returns channelId + channelType; use channelType='creator' channels only.",
			"  - Do NOT use a 'topic' channel here — those have no original uploads.",
			"",
			"After creating, call ytTriggerDiscovery to start the first scan.",
		].join("\n"),
		async (input) => {
			const feed = await client.youtube.feeds.create({
				...input,
				sourceMode: "user_channel_query",
			});
			return {
				id: feed.id,
				name: feed.name,
				gameTitle: feed.gameTitle,
				sourceMode: feed.sourceMode,
				scopeChannelId: feed.scopeChannelId,
				scopeChannelName: feed.scopeChannelName,
				searchQuery: feed.searchQuery,
				titleStopWords: feed.titleStopWords,
				status: feed.status,
				createdAt: feed.createdAt,
			};
		},
	);
