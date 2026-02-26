import z from "zod";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

const schema = z.object({
	/** Feed display name, e.g. "Mewgenics — Game Channel" */
	name: z.string().trim().min(1).max(200),
	/** The game title as it appears on YouTube, e.g. "Mewgenics" */
	gameTitle: z.string().trim().min(1).max(200),
	/**
	 * YouTube channel ID of the game's aggregator page (UC…).
	 * Get this from ytGetGameChannel OR from ytSearchChannels where channelType="topic".
	 * These topic channels have a Videos tab containing all game-tagged content.
	 */
	scopeChannelId: z
		.string()
		.trim()
		.regex(/^UC[\w-]{22}$/, "Must be a YouTube channel ID starting with UC"),
	/** Display name for the scope channel, e.g. "Mewgenics - Topic" */
	scopeChannelName: z.string().trim().min(1).max(200),
	/**
	 * Exclude videos shorter than N seconds. e.g. 60 to skip Shorts, 300 to skip trailers.
	 * Optional — omit to allow all durations.
	 */
	minDurationSeconds: z.number().int().min(1).max(86_400).optional(),
	/** Comma-separated words to filter out by video title after discovery. */
	titleStopWords: z.string().trim().max(2000).optional(),
	gameVersion: z.string().trim().max(50).optional(),
});

export const createCreateFeedGameChannelTool = (client: AppRouterClient) =>
	orpcMutationTool(
		llmSafe(schema),
		[
			"Create a discovery feed that monitors all videos tagged to a specific game on YouTube.",
			"",
			"Uses sourceMode=game_channel, which crawls the game's YouTube aggregator channel.",
			"This channel aggregates every video on YouTube tagged to this game — it's the most complete source.",
			"",
			"How to get scopeChannelId:",
			"  Option A: ytGetGameChannel(videoId) — pass any video about this game, returns the game channel directly.",
			"  Option B: ytSearchChannels(query) — pick the result where channelType='topic' for the game.",
			"",
			"After creating, call ytTriggerDiscovery to start the first scan.",
		].join("\n"),
		async (input) => {
			const feed = await client.youtube.feeds.create({
				...input,
				sourceMode: "game_channel",
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
