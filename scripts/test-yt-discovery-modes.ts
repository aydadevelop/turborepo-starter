/**
 * Tests all 4 feed discovery modes introduced in the feed system:
 *
 *   1. Playlist     — getPlaylistVideos()
 *   2. Channel+query — searchChannelVideos()   (channel-scoped search)
 *   3. Channel-only — getChannelVideos()       (recent tab browse)
 *   4. Keyword      — searchYouTube()          (global search)
 *
 * Run: bun --preload scripts/cf-sockets-stub.ts scripts/test-yt-discovery-modes.ts
 */

import {
	getChannelVideos,
	searchChannelVideos,
} from "../packages/youtube/src/channel";
import { getPlaylistVideos } from "../packages/youtube/src/playlist";
import { searchYouTube } from "../packages/youtube/src/search";

// ─── Fixtures ────────────────────────────────────────────────────────────────

// CohhCarnage — well-known let's-play streamer
const COHH_CHANNEL_ID = "UCp9TXGvv2-7JVVdyKEi0A6A";
// CohhCarnage's official VOD playlist (public, long-running)
const COHH_VODS_PLAYLIST = "PLN39y5i_H0Fnmd76lWcgVQsuyKBktrMgq";
// Search term that's specific enough to show real channel-search results
const CHANNEL_SEARCH_QUERY = "Mewgenics";
// Global keyword search
const KEYWORD_QUERY = "Mewgenics gameplay";

function printResult(
	r: {
		youtubeVideoId: string;
		title: string;
		channelId: string | null;
		channelName: string | null;
		duration: string | null;
		viewCount: number | null;
		publishedAt: string | null;
	},
	idx: number,
) {
	console.log(
		`  ${idx + 1}. [${r.youtubeVideoId}] ${r.title.slice(0, 70)}`,
	);
	console.log(
		`     channel: ${r.channelName ?? "?"} (${r.channelId ?? "?"})`,
	);
	console.log(
		`     duration: ${r.duration ?? "?"} | views: ${r.viewCount?.toLocaleString() ?? "?"} | published: ${r.publishedAt ?? "?"}`,
	);
	console.log(
		`     url: https://youtube.com/watch?v=${r.youtubeVideoId}`,
	);
}

// ─── Mode 1: Playlist ────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════");
console.log("MODE 1 — Playlist: getPlaylistVideos()");
console.log(`Playlist: ${COHH_VODS_PLAYLIST}`);
console.log("══════════════════════════════════════════════════════");

try {
	const results = await getPlaylistVideos({
		playlistId: COHH_VODS_PLAYLIST,
		maxResults: 5,
	});
	if (results.length === 0) {
		console.log("  ⚠️  No results");
	} else {
		results.forEach(printResult);
		console.log(`\n  ✓ ${results.length} video(s) fetched from playlist`);
	}
} catch (e) {
	console.error("  ✗ Error:", (e as Error).message);
}

// ─── Mode 2: Channel + search query ─────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════");
console.log("MODE 2 — Channel search: searchChannelVideos()");
console.log(`Channel: ${COHH_CHANNEL_ID}  Query: "${CHANNEL_SEARCH_QUERY}"`);
console.log("  (equivalent to /@CohhCarnage/search?query=Mewgenics)");
console.log("══════════════════════════════════════════════════════");

try {
	const results = await searchChannelVideos({
		channelId: COHH_CHANNEL_ID,
		query: CHANNEL_SEARCH_QUERY,
		maxResults: 5,
	});
	if (results.length === 0) {
		console.log("  ⚠️  No results (channel may have no matching videos)");
	} else {
		results.forEach(printResult);
		console.log(
			`\n  ✓ ${results.length} video(s) found within channel "${CHANNEL_SEARCH_QUERY}"`,
		);
	}
} catch (e) {
	console.error("  ✗ Error:", (e as Error).message);
}

// ─── Mode 3: Channel browse (recent tab) ─────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════");
console.log("MODE 3 — Channel browse: getChannelVideos() recent tab");
console.log(`Channel: ${COHH_CHANNEL_ID}`);
console.log("══════════════════════════════════════════════════════");

try {
	const results = await getChannelVideos({
		channelId: COHH_CHANNEL_ID,
		tab: "recent",
		maxResults: 5,
	});
	if (results.length === 0) {
		console.log(
			"  ⚠️  No results (channel may have no uploads in the last 7 days)",
		);
	} else {
		results.forEach(printResult);
		console.log(`\n  ✓ ${results.length} recent upload(s) from channel`);
	}
} catch (e) {
	console.error("  ✗ Error:", (e as Error).message);
}

// ─── Mode 4: Global keyword search ───────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════");
console.log("MODE 4 — Keyword search: searchYouTube()");
console.log(`Query: "${KEYWORD_QUERY}"`);
console.log("══════════════════════════════════════════════════════");

try {
	const results = await searchYouTube({
		query: KEYWORD_QUERY,
		maxResults: 5,
	});
	if (results.length === 0) {
		console.log("  ⚠️  No results");
	} else {
		results.forEach(printResult);
		console.log(`\n  ✓ ${results.length} result(s) from global search`);
	}
} catch (e) {
	console.error("  ✗ Error:", (e as Error).message);
}

console.log("\n══════════════════════════════════════════════════════");
console.log("Done.");
