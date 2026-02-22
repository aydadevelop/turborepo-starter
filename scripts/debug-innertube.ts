// Test InnerTube API for both audio URLs and captions
export {};
const videoId = "UjayV4GWkPc";

// InnerTube ANDROID client — typically returns direct audio URLs without ciphering
const body = {
	videoId,
	context: {
		client: {
			clientName: "ANDROID",
			clientVersion: "19.09.37",
			androidSdkVersion: 30,
		},
	},
};

const res = await fetch(
	"https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
	{
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent":
				"com.google.android.youtube/19.09.37 (Linux; U; Android 11)",
			"X-YouTube-Client-Name": "3",
			"X-YouTube-Client-Version": "19.09.37",
		},
		body: JSON.stringify(body),
	}
);

console.log("InnerTube status:", res.status);
const data = (await res.json()) as Record<string, unknown>;

// Check captions
const capTracks =
	((
		(data.captions as Record<string, unknown>)
			?.playerCaptionsTracklistRenderer as Record<string, unknown>
	)?.captionTracks as {
		baseUrl: string;
		languageCode: string;
		kind?: string;
	}[]) ?? [];

console.log("caption tracks:", capTracks.length);
for (const t of capTracks) {
	console.log(` lang=${t.languageCode} kind=${t.kind ?? "manual"}`);
}

// Try fetching a caption
const enTrack = capTracks.find((t) => t.languageCode === "en");
if (enTrack) {
	const capRes = await fetch(`${enTrack.baseUrl}&fmt=json3`);
	const capBody = await capRes.text();
	console.log("caption body length:", capBody.length);
	console.log("caption preview:", capBody.slice(0, 300));
}

// Check audio formats
const formats =
	((data.streamingData as Record<string, unknown>)?.adaptiveFormats as Record<
		string,
		unknown
	>[]) ?? [];
const audioFmts = formats.filter((f) =>
	(f.mimeType as string)?.startsWith("audio/")
);
console.log("\naudio formats:", audioFmts.length);
for (const f of audioFmts.slice(0, 4)) {
	console.log(
		` itag=${f.itag} mime=${(f.mimeType as string).split(";")[0]} hasUrl=${!!f.url}`
	);
}
