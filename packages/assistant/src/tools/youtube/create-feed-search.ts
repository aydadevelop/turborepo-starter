import z from "zod";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

const schema = z.object({
	/** Feed display name, e.g. "Mewgenics — Broad Search" */
	name: z.string().trim().min(1).max(200),
	/** The game title to associate with this feed, e.g. "Mewgenics" */
	gameTitle: z.string().trim().min(1).max(200),
	/**
	 * YouTube search query sent as a broad site-wide search, e.g. "Mewgenics gameplay".
	 * Use the game title plus a qualifier like "gameplay", "review", or "guide".
	 */
	searchQuery: z.string().trim().min(1).max(500),
	/**
	 * Comma-separated terms to EXCLUDE from the search query (appended as -word).
	 * e.g. "trailer,announcement" to skip marketing videos.
	 * Only applies to this sourceMode.
	 */
	searchStopWords: z.string().trim().max(2000).optional(),
	/** Comma-separated words to filter out by video title after discovery. */
	titleStopWords: z.string().trim().max(2000).optional(),
	/**
	 * Exclude videos shorter than N seconds. e.g. 60 to skip Shorts, 300 to skip trailers.
	 * Optional — omit to allow all durations.
	 */
	minDurationSeconds: z.number().int().min(1).max(86_400).optional(),
	gameVersion: z.string().trim().max(50).optional(),
});

export const createCreateFeedSearchTool = (client: AppRouterClient) =>
	orpcMutationTool(
		llmSafe(schema),
		[
			"Create a discovery feed that runs a broad YouTube-wide keyword search for game videos.",
			"",
			"Uses sourceMode=search: periodic YouTube search for searchQuery across all channels.",
			"Best when you want coverage from many different creators and channels.",
			"Combine with ytCreateFeedGameChannel for maximum coverage.",
			"",
			"Tip: identify common off-topic titles from ytSearchVideos results first, then add them as searchStopWords.",
			"",
			"After creating, call ytTriggerDiscovery to start the first scan.",
		].join("\n"),
		async (input) => {
			const feed = await client.youtube.feeds.create({
				...input,
				sourceMode: "search",
			});
			return {
				id: feed.id,
				name: feed.name,
				gameTitle: feed.gameTitle,
				sourceMode: feed.sourceMode,
				searchQuery: feed.searchQuery,
				searchStopWords: feed.searchStopWords,
				titleStopWords: feed.titleStopWords,
				status: feed.status,
				createdAt: feed.createdAt,
			};
		},
	);
