import {
	extractJsonVar,
	fetchWatchPage,
	USER_AGENT,
} from "../packages/youtube/src/page";

const videoId = "UjayV4GWkPc";
const html = await fetchWatchPage(videoId);
const player = extractJsonVar(html, "ytInitialPlayerResponse");

// --- Caption: try with Referer header ---
const tracks =
	((
		(player?.captions as Record<string, unknown>)
			?.playerCaptionsTracklistRenderer as Record<string, unknown>
	)?.captionTracks as {
		baseUrl: string;
		languageCode: string;
		kind?: string;
	}[]) ?? [];

const enTrack = tracks.find((t) => t.languageCode === "en");
if (enTrack) {
	const res = await fetch(`${enTrack.baseUrl}&fmt=json3`, {
		headers: {
			"User-Agent": USER_AGENT,
			Referer: `https://www.youtube.com/watch?v=${videoId}`,
		},
	});
	console.log(
		"caption status:",
		res.status,
		"length:",
		(await res.text()).length
	);
}

// --- Audio: inspect actual format object keys ---
const formats =
	((player?.streamingData as Record<string, unknown>)
		?.adaptiveFormats as Record<string, unknown>[]) ?? [];

const audioFmt = formats.find((f) =>
	(f.mimeType as string)?.startsWith("audio/")
);
console.log(
	"\nfirst audio format keys:",
	audioFmt ? Object.keys(audioFmt) : "none"
);
console.log(
	"first audio format:",
	JSON.stringify(audioFmt, null, 2).slice(0, 600)
);
