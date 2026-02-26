/**
 * Test searchYouTube pagination — verifies > 20 results are returned
 * Run: bun --preload ./scripts/cf-sockets-stub.ts ./scripts/test-yt-search-pagination.ts
 */
import { searchYouTube } from "../packages/youtube/src/search";

console.log("=== searchYouTube pagination test ===");
console.log("Query: Mewgenics gameplay, maxResults: 60");

const results = await searchYouTube({
	query: "Mewgenics gameplay",
	maxResults: 60,
});

console.log(`Total results returned: ${results.length}`);
console.log("\nSample (first 5 and last 5):");
const sample = [...results.slice(0, 5), ...results.slice(-5)];
sample.forEach((v, i) => {
	console.log(`  ${i + 1}. [${v.duration ?? "?"}] ${String(v.title ?? "").slice(0, 65)}`);
});

// Check duration parsing works
const withDuration = results.filter((v) => v.duration !== null);
console.log(`\nVideos with duration: ${withDuration.length}/${results.length}`);
