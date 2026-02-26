import z from "zod";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

const YT_PLAYLIST_ID_RE = /^(PL|UU|LL|FL|RD)[\w-]+$/;
const YT_PLAYLIST_PLACEHOLDER_RE = /^(PL|UU|LL|FL|RD)0+$/;

const schema = z.object({
	/** Feed display name, e.g. "Mewgenics Official Playlist" */
	name: z.string().trim().min(1).max(200),
	/** The game title to associate with this feed, e.g. "Mewgenics" */
	gameTitle: z.string().trim().min(1).max(200),
	/**
	 * YouTube playlist ID from the URL: youtube.com/playlist?list=PLxxxxxx
	 * The ID starts with PL, UU, LL, FL, or RD followed by alphanumeric characters.
	 * NEVER invent or guess a playlist ID — only use one the user explicitly provided.
	 */
	playlistId: z
		.string()
		.trim()
		.regex(YT_PLAYLIST_ID_RE, "Playlist ID must start with PL, UU, LL, FL, or RD")
		.refine(
			(v) => !YT_PLAYLIST_PLACEHOLDER_RE.test(v),
			"Playlist ID looks like a placeholder (all zeros). Use the real ID from the playlist URL.",
		),
	/** Comma-separated words to filter out by video title after discovery. */
	titleStopWords: z.string().trim().max(2000).optional(),
	/**
	 * Exclude videos shorter than N seconds. e.g. 60 to skip Shorts, 300 to skip trailers.
	 * Optional — omit to allow all durations.
	 */
	minDurationSeconds: z.number().int().min(1).max(86_400).optional(),
	gameVersion: z.string().trim().max(50).optional(),
});

export const createCreateFeedPlaylistTool = (client: AppRouterClient) =>
	orpcMutationTool(
		llmSafe(schema),
		[
			"Create a discovery feed that monitors a specific YouTube playlist.",
			"",
			"Uses sourceMode=playlist: periodically fetches all videos from the given playlist.",
			"",
			"IMPORTANT: Only call this tool when the user has provided an actual YouTube playlist URL.",
			"Extract the playlistId from the URL: youtube.com/playlist?list=<playlistId>",
			"NEVER invent or guess a playlist ID — if you don't have a URL, use ytCreateFeedSearch or ytCreateFeedGameChannel instead.",
			"",
			"After creating, call ytTriggerDiscovery to start the first scan.",
		].join("\n"),
		async (input) => {
			const feed = await client.youtube.feeds.create({
				...input,
				sourceMode: "playlist",
			});
			return {
				id: feed.id,
				name: feed.name,
				gameTitle: feed.gameTitle,
				sourceMode: feed.sourceMode,
				playlistId: feed.playlistId,
				titleStopWords: feed.titleStopWords,
				status: feed.status,
				createdAt: feed.createdAt,
			};
		},
	);
