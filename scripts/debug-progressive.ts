// Check progressive (non-adaptive) formats from InnerTube
import { fetchPlayerResponse } from "../packages/youtube/src/page";

const data = await fetchPlayerResponse("UjayV4GWkPc");
const sd = data.streamingData as Record<string, unknown> | undefined;
const formats = (sd?.formats ?? []) as Record<string, unknown>[];

console.log("progressive formats count:", formats.length);
for (const f of formats) {
	const mime = (f.mimeType as string)?.split(";")[0];
	const hasUrl = !!f.url;
	const cl = f.contentLength;
	console.log(` itag=${f.itag} mime=${mime} hasUrl=${hasUrl} cl=${cl}`);
}

// Try fetching two chunks from first format with url
const fmt = formats.find((f) => f.url);
if (fmt?.url) {
	const url = fmt.url as string;
	const ua = "com.google.android.youtube/19.09.37 (Linux; U; Android 11)";
	console.log(
		"\nTesting progressive format:",
		(fmt.mimeType as string)?.split(";")[0]
	);

	const r1 = await fetch(`${url}&range=0-262143&rn=1`, {
		headers: { "User-Agent": ua },
	});
	console.log("chunk 0 status:", r1.status);
	if (r1.ok) {
		await r1.arrayBuffer();
	}

	const r2 = await fetch(`${url}&range=262144-524287&rn=2`, {
		headers: { "User-Agent": ua },
	});
	console.log("chunk 1 status:", r2.status);
}
