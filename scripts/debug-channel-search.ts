/**
 * Debug raw channelRenderer structure from YouTube channel search results.
 * Run: bun scripts/debug-channel-search.ts [query]
 *
 * Dumps top-level channelRenderer keys so we can verify field mapping
 * (subscriberCountText, videoCountText, customUrl, etc.).
 */

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const query = process.argv[2] ?? "Mewgenics game";

console.log(`\nSearching YouTube channels for: "${query}"\n`);

const searchUrl = new URL("https://www.youtube.com/results");
searchUrl.searchParams.set("q", query);
searchUrl.searchParams.set("hl", "en");
searchUrl.searchParams.set("sp", "EgIQAg%3D%3D");

const response = await fetch(searchUrl.toString(), {
	headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
});

const html = await response.text();

const marker = "var ytInitialData = ";
const start = html.indexOf(marker);
const jsonStart = start + marker.length;
const candidates = [
	html.indexOf(";</script>", jsonStart),
	html.indexOf(";var ", jsonStart),
	html.indexOf(";window[", jsonStart),
	html.indexOf(";\n", jsonStart),
].filter((p) => p !== -1);
const data = JSON.parse(html.slice(jsonStart, Math.min(...candidates)));

// Collect all channelRenderer nodes
const renderers: Record<string, unknown>[] = [];
function collect(node: unknown): void {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) { node.forEach(collect); return; }
	const obj = node as Record<string, unknown>;
	if (obj.channelRenderer) renderers.push(obj.channelRenderer as Record<string, unknown>);
	for (const v of Object.values(obj)) collect(v);
}
collect(data);

console.log(`Found ${renderers.length} channelRenderer(s)\n`);
for (const [i, cr] of renderers.slice(0, 5).entries()) {
	console.log(`\n══ channelRenderer[${i}] ══`);
	for (const [k, v] of Object.entries(cr)) {
		const s = JSON.stringify(v);
		console.log(`  ${k}: ${s.length > 120 ? s.slice(0, 120) + "…" : s}`);
	}
}
