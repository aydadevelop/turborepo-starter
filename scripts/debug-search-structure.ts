/**
 * Debug searchYouTube internal rendering structure
 * Run: bun --preload ./scripts/cf-sockets-stub.ts ./scripts/debug-search-structure.ts
 */
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const INNERTUBE_CLIENT_VERSION = "2.20240101.00.00";

// ── 1. Initial page ─────────────────────────────────────────────────────────
const url = "https://www.youtube.com/results?q=Mewgenics+gameplay&hl=en&sp=EgIQAQ%3D%3D";
const html = await (await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" } })).text();
const marker = "var ytInitialData = ";
const start = html.indexOf(marker);
const jsonEnd = html.indexOf(";</script>", start + marker.length);
const data = JSON.parse(html.slice(start + marker.length, jsonEnd)) as Record<string, unknown>;

function collectVideoRenderers(node: unknown): Record<string, unknown>[] {
	if (!node || typeof node !== "object") { return []; }
	if (Array.isArray(node)) { return node.flatMap(collectVideoRenderers); }
	const obj = node as Record<string, unknown>;
	const results: Record<string, unknown>[] = [];
	if ("videoRenderer" in obj && obj.videoRenderer && typeof obj.videoRenderer === "object") {
		results.push(obj.videoRenderer as Record<string, unknown>);
	}
	for (const value of Object.values(obj)) { results.push(...collectVideoRenderers(value)); }
	return results;
}

function extractToken(node: unknown): string | null {
	if (!node || typeof node !== "object") { return null; }
	if (Array.isArray(node)) {
		for (const item of node) { const f = extractToken(item); if (f) { return f; } }
		return null;
	}
	const obj = node as Record<string, unknown>;
	if ("continuationItemRenderer" in obj) {
		const cmd = ((obj.continuationItemRenderer as Record<string, unknown>)
			?.continuationEndpoint as Record<string, unknown>)
			?.continuationCommand as Record<string, unknown>;
		if (cmd?.token && typeof cmd.token === "string") { return cmd.token; }
	}
	for (const v of Object.values(obj)) { const f = extractToken(v); if (f) { return f; } }
	return null;
}

const initialRenderers = collectVideoRenderers(data);
console.log(`Initial page videoRenderers: ${initialRenderers.length}`);

// Show structure of first 2 renderers
for (const vr of initialRenderers.slice(0, 2)) {
	console.log("  keys:", Object.keys(vr).join(", "));
	console.log("  videoId:", vr.videoId);
	console.log("  title type:", typeof vr.title, " keys:", vr.title && typeof vr.title === "object" ? Object.keys(vr.title as object).join(", ") : vr.title);
	const title = vr.title as Record<string, unknown> | undefined;
	console.log("  title.runs:", JSON.stringify(title?.runs)?.slice(0, 80));
	console.log("  title.simpleText:", title?.simpleText);
	console.log("  lengthText:", JSON.stringify(vr.lengthText)?.slice(0, 60));
}

// ── 2. Continuation page ─────────────────────────────────────────────────────
const token0 = extractToken(data);
console.log(`\nContinuation token found: ${token0 ? "yes" : "no"}`);

if (token0) {
	const contResp = await fetch("https://www.youtube.com/youtubei/v1/search", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
			"X-YouTube-Client-Name": "1",
			"X-YouTube-Client-Version": INNERTUBE_CLIENT_VERSION,
		},
		body: JSON.stringify({
			context: { client: { clientName: "WEB", clientVersion: INNERTUBE_CLIENT_VERSION, hl: "en" } },
			continuation: token0,
		}),
	});
	const contData = await contResp.json() as Record<string, unknown>;
	console.log("Continuation response top keys:", Object.keys(contData));

	const cmds = contData.onResponseReceivedCommands as unknown[] | undefined;
	const acts = contData.onResponseReceivedActions as unknown[] | undefined;
	console.log("onResponseReceivedCommands:", cmds?.length ?? "undefined");
	console.log("onResponseReceivedActions:", acts?.length ?? "undefined");

	const action = (cmds?.[0] ?? acts?.[0]) as Record<string, unknown> | undefined;
	if (action) {
		console.log("First action keys:", Object.keys(action));
		const appendAction = action.appendContinuationItemsAction as Record<string, unknown> | undefined;
		const items = appendAction?.continuationItems as unknown[] | undefined;
		console.log("continuationItems count:", items?.length ?? "undefined");

		if (items) {
			// Find video renderers
			const videoRenderers = collectVideoRenderers(items);
			console.log(`Video renderers in continuation: ${videoRenderers.length}`);
			if (videoRenderers[0]) {
				const vr = videoRenderers[0];
				const title = vr.title as Record<string, unknown> | undefined;
				console.log("  First cont videoRenderer keys:", Object.keys(vr).join(", "));
				console.log("  title.runs:", JSON.stringify(title?.runs)?.slice(0, 100));
				console.log("  title.simpleText:", title?.simpleText);
				console.log("  lengthText:", JSON.stringify(vr.lengthText)?.slice(0, 60));
			}
		}
	}
}
