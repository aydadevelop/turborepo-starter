// Quick diagnostic for audio format extraction and CDN fetch via InnerTube
import { fetchPlayerResponse } from "../packages/youtube/src/page";

const { data } = await fetchPlayerResponse("UjayV4GWkPc");
const streamingData = data.streamingData as Record<string, unknown> | undefined;
const formats = (streamingData?.adaptiveFormats ?? []) as Record<
	string,
	unknown
>[];

console.log(
	"streamingData keys:",
	streamingData ? Object.keys(streamingData) : "NONE"
);
console.log("total adaptive formats:", formats.length);

const audioFmts = formats.filter((f) =>
	(f.mimeType as string)?.startsWith("audio/")
);
console.log("audio formats:", audioFmts.length);

// Pick the first m4a audio format and try to fetch it with different approaches
const m4aFmt = audioFmts.find((f) => (f.mimeType as string).includes("mp4"));
if (m4aFmt?.url) {
	const url = m4aFmt.url as string;
	console.log("\nm4a url start:", url.slice(0, 100));

	// Try 1: No headers
	const r1 = await fetch(url);
	console.log("\nFetch 1 (no headers):", r1.status, r1.statusText);

	// Try 2: Android UA
	const r2 = await fetch(url, {
		headers: {
			"User-Agent":
				"com.google.android.youtube/19.09.37 (Linux; U; Android 11)",
		},
	});
	console.log("Fetch 2 (android UA):", r2.status, r2.statusText);

	// Try 3: Browser UA
	const r3 = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
		},
	});
	console.log("Fetch 3 (browser UA):", r3.status, r3.statusText);

	// Try 4: Range header
	const r4 = await fetch(url, {
		headers: {
			"User-Agent":
				"com.google.android.youtube/19.09.37 (Linux; U; Android 11)",
			Range: "bytes=0-16383",
		},
	});
	console.log("Fetch 4 (range + android UA):", r4.status, r4.statusText);
	const contentLength = Number.parseInt(
		(m4aFmt.contentLength as string) ?? "0",
		10
	);
	console.log("contentLength from format:", contentLength);

	// Find max chunk size
	for (const chunkSize of [65_536, 131_072, 204_800, 262_144, 524_288]) {
		const end = Math.min(chunkSize - 1, contentLength - 1);
		const r = await fetch(url, {
			headers: {
				"User-Agent":
					"com.google.android.youtube/19.09.37 (Linux; U; Android 11)",
				Range: `bytes=0-${end}`,
			},
		});
		console.log(`chunk=${chunkSize} → status=${r.status}`);
		if (r.ok) {
			await r.arrayBuffer(); // drain
		}
	}
} else {
	console.log("No m4a format with url found");
}
