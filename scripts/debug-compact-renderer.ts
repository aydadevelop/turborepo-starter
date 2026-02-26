/**
 * Inspect compactVideoRenderer structure from channel search
 * Run: bun --preload ./scripts/cf-sockets-stub.ts ./scripts/debug-compact-renderer.ts
 */
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const channelId = "UCr3Ii8z6M_SukYNJFurj6JA";
const query = "Mewgenics";
const url = `https://www.youtube.com/channel/${channelId}/search?query=${encodeURIComponent(query)}`;

const response = await fetch(url, {
	headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
});
const html = await response.text();

const marker = "var ytInitialData = ";
const start = html.indexOf(marker);
const jsonStart = start + marker.length;
const jsonEnd = html.indexOf(";</script>", jsonStart);
const data = JSON.parse(html.slice(jsonStart, jsonEnd)) as Record<string, unknown>;

// Find all tabs
const tabs = (data?.contents as Record<string, unknown> | undefined) as Record<string, unknown> | undefined;
const browseResults = (tabs?.twoColumnBrowseResultsRenderer as Record<string, unknown> | undefined);
const allTabs = (browseResults?.tabs as unknown[]) ?? [];

console.log("=== ALL TABS ===");
for (const tab of allTabs) {
	const t = (tab as Record<string, unknown>).tabRenderer ?? (tab as Record<string, unknown>).expandableTabRenderer ?? {};
	const tr = t as Record<string, unknown>;
	console.log("Tab:", tr.title, " selected:", tr.selected);
}

// Find first compactVideoRenderer in ALL tabs (including non-selected)
console.log("\n=== SEARCHING ALL TABS FOR VIDEO RENDERERS ===");
function findRenderer(node: unknown, key: string, max = 2): Record<string, unknown>[] {
	if (!node || typeof node !== "object") return [];
	if (Array.isArray(node)) return node.flatMap((n) => findRenderer(n, key, max));
	const obj = node as Record<string, unknown>;
	const results: Record<string, unknown>[] = [];
	if (key in obj) results.push(obj[key] as Record<string, unknown>);
	if (results.length >= max) return results.slice(0, max);
	for (const v of Object.values(obj)) {
		results.push(...findRenderer(v, key, max - results.length));
		if (results.length >= max) break;
	}
	return results.slice(0, max);
}

const compactVRs = findRenderer(data, "compactVideoRenderer", 1);
const videoVRs = findRenderer(data, "videoRenderer", 1);
const gridVRs = findRenderer(data, "gridVideoRenderer", 1);

console.log("\ncompactVideoRenderer count found:", compactVRs.length);
if (compactVRs[0]) {
	console.log("compactVideoRenderer keys:", Object.keys(compactVRs[0]));
	const vr = compactVRs[0] as Record<string, unknown>;
	console.log("  videoId:", vr.videoId);
	console.log("  title:", JSON.stringify(vr.title)?.slice(0, 100));
	console.log("  lengthText:", JSON.stringify(vr.lengthText)?.slice(0, 80));
	console.log("  shortBylineText:", JSON.stringify(vr.shortBylineText)?.slice(0, 120));
	console.log("  longBylineText:", JSON.stringify(vr.longBylineText)?.slice(0, 120));
	console.log("  viewCountText:", JSON.stringify(vr.viewCountText)?.slice(0, 80));
	console.log("  publishedTimeText:", JSON.stringify(vr.publishedTimeText)?.slice(0, 80));
}

console.log("\nvideoRenderer count found:", videoVRs.length);
console.log("gridVideoRenderer count found:", gridVRs.length);

// Count all unique renderer types in the data
function findAllRendererKeys(node: unknown, depth = 0): Set<string> {
	const keys = new Set<string>();
	if (!node || typeof node !== "object" || depth > 20) return keys;
	if (Array.isArray(node)) {
		for (const n of node) {
			for (const k of findAllRendererKeys(n, depth + 1)) keys.add(k);
		}
		return keys;
	}
	const obj = node as Record<string, unknown>;
	for (const [k, v] of Object.entries(obj)) {
		if (k.endsWith("Renderer")) keys.add(k);
		for (const rk of findAllRendererKeys(v, depth + 1)) keys.add(rk);
	}
	return keys;
}

console.log("\n=== ALL RENDERER TYPES IN DATA ===");
const rendererTypes = findAllRendererKeys(data);
console.log([...rendererTypes].sort().join("\n"));
