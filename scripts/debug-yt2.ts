/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { extractJsonVar, fetchWatchPage } from "../packages/youtube/src/page";

const videoId = "UjayV4GWkPc";
const html = await fetchWatchPage(videoId);
const player = extractJsonVar(html, "ytInitialPlayerResponse");

// --- Captions debug ---
const tracks = ((player?.captions as any)?.playerCaptionsTracklistRenderer
	?.captionTracks ?? []) as any[];
console.log("captionTracks count:", tracks.length);
for (const t of tracks) {
	console.log(
		` lang=${t.languageCode} kind=${t.kind ?? "manual"} url=${t.baseUrl?.slice(0, 80)}...`
	);
}

// Fetch the EN track
const enTrack = tracks.find((t: any) => t.languageCode === "en");
if (enTrack) {
	const res = await fetch(`${enTrack.baseUrl}&fmt=json3`);
	console.log("\ncaption fetch status:", res.status);
	const body = await res.text();
	console.log("caption body length:", body.length);
	console.log("caption body preview:", body.slice(0, 500));
}

// --- Audio debug ---
const formats = ((player?.streamingData as any)?.adaptiveFormats ??
	[]) as any[];
const audioFormats = formats.filter((f: any) =>
	f.mimeType?.startsWith("audio/")
);
console.log("\naudio formats count:", audioFormats.length);
for (const f of audioFormats) {
	console.log(
		` itag=${f.itag} mime=${f.mimeType} hasUrl=${!!f.url} hasCipher=${!!f.signatureCipher}`
	);
}
