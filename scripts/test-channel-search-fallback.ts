/**
 * Test the channel search fallback for channels without a Search tab
 * Run: bun --preload ./scripts/cf-sockets-stub.ts ./scripts/test-channel-search-fallback.ts
 */
import { getChannelVideos, searchChannelVideos } from "../packages/youtube/src/channel";

const channelId = "UCr3Ii8z6M_SukYNJFurj6JA";
const query = "Mewgenics";
const queryWords = query.toLowerCase().split(" ").filter(Boolean);

console.log("=== Channel search fallback test ===");
console.log("Channel:", channelId);
console.log("Query:", query);

// Step 1: try channel search
const searchResults = await searchChannelVideos({ channelId, query, maxResults: 20 });
console.log("\nChannel search results:", searchResults.length);

if (searchResults.length === 0) {
	console.log("→ Fallback: browse channel + title filter");
	const browse = await getChannelVideos({ channelId, tab: "recent", maxResults: 50 });
	console.log("Browse results:", browse.length);

	const filtered = browse.filter((v) =>
		queryWords.some((w) => v.title.toLowerCase().includes(w))
	);
	console.log("Title-filtered:", filtered.length);

	filtered.slice(0, 8).forEach((v, i) => {
		console.log(`  ${i + 1}. [${v.duration}] ${v.title.slice(0, 70)}`);
	});
} else {
	searchResults.slice(0, 5).forEach((v, i) => {
		console.log(`  ${i + 1}. [${v.duration}] ${v.title.slice(0, 70)}`);
	});
}
