/**
 * Real-world channel browsing test.
 *
 * Run: bun scripts/test-yt-channel.ts
 */
import {
	getChannelVideos,
	getVideoGame,
} from "../packages/youtube/src/channel";

const GAMING_CHANNEL = "UCxMD8xMWR8MAycmbUqQsNGg"; // gaming/game-dev channel
const LETSPLAY_CHANNEL = "UCBherm1YniOGHPxIyY5aRmA";

const CASES = [
	{
		label: "videos / newest",
		opts: {
			channelId: GAMING_CHANNEL,
			tab: "videos" as const,
			sort: "newest" as const,
			maxResults: 5,
		},
	},
	{
		label: "videos / popular",
		opts: {
			channelId: GAMING_CHANNEL,
			tab: "videos" as const,
			sort: "popular" as const,
			maxResults: 5,
		},
	},
	{
		label: "recent (last 7 days)",
		opts: { channelId: GAMING_CHANNEL, tab: "recent" as const, maxResults: 5 },
	},
	{
		label: "letsplay tab",
		opts: {
			channelId: LETSPLAY_CHANNEL,
			tab: "letsplay" as const,
			maxResults: 5,
		},
	},
];

for (const { label, opts } of CASES) {
	console.log(`\n=== ${label} ===`);
	try {
		const results = await getChannelVideos(opts);
		if (results.length === 0) {
			console.log("  No results found");
		} else {
			for (const r of results) {
				console.log(`  [${r.youtubeVideoId}] ${r.title}`);
				console.log(
					`    channel: ${r.channelName ?? "?"} (${r.channelId ?? "?"})`
				);
				console.log(
					`    duration: ${r.duration ?? "?"} | views: ${r.viewCount?.toLocaleString() ?? "?"} | published: ${r.publishedAt ?? "?"}`
				);
			}
		}
		console.log(`  → ${results.length} result(s)`);
	} catch (err) {
		console.error("  ERROR:", err instanceof Error ? err.message : err);
	}
}

// Game extraction from a specific video
console.log("\n=== getVideoGame (gaming video) ===");
try {
	// Use first video from the gaming channel's videos tab
	const videos = await getChannelVideos({
		channelId: GAMING_CHANNEL,
		tab: "videos",
		maxResults: 3,
	});
	for (const v of videos) {
		const game = await getVideoGame(v.youtubeVideoId);
		console.log(
			`  [${v.youtubeVideoId}] ${v.title.slice(0, 50)} → game: ${game ?? "(none)"}`
		);
	}
} catch (err) {
	console.error("  ERROR:", err instanceof Error ? err.message : err);
}
