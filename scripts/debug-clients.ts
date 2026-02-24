// Test different InnerTube clients to find one that returns URLs without n-throttling
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
export {};

const videoId = "UjayV4GWkPc";
const UA_ANDROID = "com.google.android.youtube/19.09.37 (Linux; U; Android 11)";

async function testClient(
	clientName: string,
	clientVersion: string,
	headers: Record<string, string>,
	body: Record<string, unknown>
) {
	console.log(`\n=== ${clientName} ===`);
	try {
		const res = await fetch(
			"https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", ...headers },
				body: JSON.stringify({
					videoId,
					context: { client: { clientName, clientVersion, ...body } },
				}),
			}
		);
		console.log("InnerTube status:", res.status);
		const data = (await res.json()) as Record<string, unknown>;
		const formats = (data.streamingData as any)?.adaptiveFormats ?? [];
		const audioFmts = formats.filter((f: any) =>
			f.mimeType?.startsWith("audio/")
		);
		const m4a = audioFmts.find(
			(f: any) => f.url && f.mimeType?.includes("mp4")
		);
		console.log("audio formats:", audioFmts.length, "m4a with url:", !!m4a);
		if (!m4a?.url) {
			return;
		}
		// Test 2 chunks
		const _cl = Number(m4a.contentLength ?? m4a.approxDurationMs ?? 16_000_000);
		console.log("contentLength:", m4a.contentLength);
		const r = await fetch(`${m4a.url}&range=0-262143&rn=1`, {
			headers: { "User-Agent": UA_ANDROID },
		});
		console.log("chunk 0 status:", r.status);
		if (r.ok) {
			await r.arrayBuffer();
		}
		const r2 = await fetch(`${m4a.url}&range=262144-524287&rn=2`, {
			headers: { "User-Agent": UA_ANDROID },
		});
		console.log("chunk 1 status:", r2.status);
		if (r2.ok) {
			await r2.arrayBuffer();
		}
	} catch (e: any) {
		console.log("error:", e.message);
	}
}

// ANDROID (current)
await testClient(
	"ANDROID",
	"19.09.37",
	{
		"User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11)",
		"X-YouTube-Client-Name": "3",
		"X-YouTube-Client-Version": "19.09.37",
	},
	{ androidSdkVersion: 30 }
);

// MWEB
await testClient(
	"MWEB",
	"2.20231121.01.00",
	{
		"User-Agent":
			"Mozilla/5.0 (Linux; Android 9; SM-G973N) AppleWebKit/537.36 Mobile Safari/537.36",
		"X-YouTube-Client-Name": "2",
		"X-YouTube-Client-Version": "2.20231121.01.00",
	},
	{}
);

// TV Embedded
await testClient(
	"TVHTML5_SIMPLY_EMBEDDED_PLAYER",
	"2.0",
	{
		"User-Agent":
			"Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 TV Safari/538.1",
		"X-YouTube-Client-Name": "85",
		"X-YouTube-Client-Version": "2.0",
	},
	{}
);
