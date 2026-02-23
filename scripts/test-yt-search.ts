/**
 * Real-world search test — scrapes YouTube search results without an API key.
 *
 * Run: bun scripts/test-yt-search.ts
 */
import { searchYouTube } from "../packages/youtube/src/search";

const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
const oneMonthAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();

const CASES = [
	{ label: "no filters", opts: { query: "reanimal gameplay", maxResults: 3 } },
	{
		label: "long videos (>20min)",
		opts: {
			query: "reanimal gameplay",
			maxResults: 3,
			duration: "long" as const,
		},
	},
	{
		label: "medium videos (4-20min)",
		opts: {
			query: "reanimal gameplay",
			maxResults: 3,
			duration: "medium" as const,
		},
	},
	{
		label: "short videos (<4min)",
		opts: {
			query: "reanimal review",
			maxResults: 3,
			duration: "short" as const,
		},
	},
	{
		label: "uploaded this week",
		opts: { query: "reanimal", maxResults: 3, publishedAfter: oneWeekAgo },
	},
	{
		label: "uploaded this month + long",
		opts: {
			query: "elden ring",
			maxResults: 3,
			publishedAfter: oneMonthAgo,
			duration: "long" as const,
		},
	},
	{
		label: "stop words (exclude shorts/clips)",
		opts: {
			query: "reanimal",
			maxResults: 3,
			stopWords: ["shorts", "#shorts"],
		},
	},
];

for (const { label, opts } of CASES) {
	console.log(`\n=== ${label} ===`);
	try {
		const results = await searchYouTube(opts);

		if (results.length === 0) {
			console.log("  No results found");
			continue;
		}

		for (const r of results) {
			console.log(`  [${r.youtubeVideoId}] ${r.title}`);
			console.log(
				`    channelId: ${r.channelId ?? "?"} | channel: ${r.channelName ?? "?"}`
			);
			console.log(
				`    views: ${r.viewCount?.toLocaleString() ?? "?"} | duration: ${r.duration ?? "?"} | published: ${r.publishedAt ?? "?"}`
			);
		}
		console.log(`  → ${results.length} result(s)`);
	} catch (e) {
		console.error(`  Error: ${(e as Error).message}`);
	}
}
