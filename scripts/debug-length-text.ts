/**
 * Check if lengthText has simpleText on search results
 * Run: bun --preload ./scripts/cf-sockets-stub.ts ./scripts/debug-length-text.ts
 */
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const html = await (
	await fetch("https://www.youtube.com/results?q=Mewgenics+gameplay&hl=en", {
		headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
	})
).text();

const marker = "var ytInitialData = ";
const start = html.indexOf(marker);
const jsonEnd = html.indexOf(";</script>", start + marker.length);
const data = JSON.parse(html.slice(start + marker.length, jsonEnd)) as Record<string, unknown>;

function findAll(node: unknown, key: string, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
	if (!node || typeof node !== "object") { return found; }
	if (Array.isArray(node)) { node.forEach((n) => findAll(n, key, found)); return found; }
	const obj = node as Record<string, unknown>;
	if (key in obj) { found.push(obj); }
	Object.values(obj).forEach((v) => findAll(v, key, found));
	return found;
}

const videoRenderers = findAll(data, "videoRenderer").map((o) => o.videoRenderer as Record<string, unknown>);
console.log(`Total videoRenderers: ${videoRenderers.length}`);
console.log("\n--- First 5 lengthText values ---");
for (const [i, vr] of videoRenderers.slice(0, 5).entries()) {
	const lt = vr.lengthText as Record<string, unknown> | undefined;
	console.log(`${i + 1}. videoId: ${vr.videoId}`);
	console.log(`   title.runs[0].text: ${((vr.title as Record<string, unknown>)?.runs as {text:string}[])?.[0]?.text?.slice(0, 50)}`);
	console.log(`   lengthText keys: ${lt ? Object.keys(lt).join(", ") : "null"}`);
	console.log(`   lengthText.simpleText: ${lt?.simpleText}`);
	console.log(`   lengthText.accessibility label: ${((lt?.accessibility as Record<string, unknown>)?.accessibilityData as Record<string, unknown>)?.label}`);
}

// Check how many have simpleText in lengthText
const withSimpleText = videoRenderers.filter((vr) => (vr.lengthText as Record<string, unknown>)?.simpleText);
const withNoLength = videoRenderers.filter((vr) => !vr.lengthText);
console.log(`\nWith lengthText.simpleText: ${withSimpleText.length}/${videoRenderers.length}`);
console.log(`With no lengthText at all: ${withNoLength.length}/${videoRenderers.length}`);

// Check titles — any that don't parse via runs?
const brokenTitle = videoRenderers.filter((vr) => {
	const runs = (vr.title as Record<string, unknown>)?.runs as {text:string}[] | undefined;
	return !runs?.[0]?.text;
});
console.log(`With broken title (no runs[0].text): ${brokenTitle.length}/${videoRenderers.length}`);
if (brokenTitle.length > 0) {
	console.log("Broken title renderer keys:", Object.keys(brokenTitle[0]).join(", "));
	console.log("Broken title.type:", typeof brokenTitle[0].title, JSON.stringify(brokenTitle[0].title)?.slice(0, 100));
}
