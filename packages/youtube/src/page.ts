/** Shared YouTube InnerTube API utilities. */

export const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** InnerTube ANDROID client — returns direct streaming URLs without ciphering. */
const INNERTUBE_URL =
	"https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

/**
 * Fetch the InnerTube player response for a video.
 *
 * Uses the ANDROID client context which:
 * - Returns adaptive format URLs directly (no signature cipher decoding needed)
 * - Returns caption track URLs that work without session cookies
 * - Works in any fetch-capable runtime including Cloudflare Workers
 */
export async function fetchPlayerResponse(
	videoId: string
): Promise<Record<string, unknown>> {
	const res = await fetch(INNERTUBE_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent":
				"com.google.android.youtube/19.09.37 (Linux; U; Android 11)",
			"X-YouTube-Client-Name": "3",
			"X-YouTube-Client-Version": "19.09.37",
		},
		body: JSON.stringify({
			videoId,
			context: {
				client: {
					clientName: "ANDROID",
					clientVersion: "19.09.37",
					androidSdkVersion: 30,
				},
			},
		}),
	});

	if (!res.ok) {
		throw new Error(`YouTube InnerTube failed: ${res.status}`);
	}

	return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Fetch a YouTube watch page with appropriate browser-like headers.
 * @deprecated Prefer fetchPlayerResponse() for reliable data extraction.
 */
export async function fetchWatchPage(videoId: string): Promise<string> {
	const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});
	if (!res.ok) {
		throw new Error(`YouTube fetch failed: ${res.status}`);
	}
	return res.text();
}

/**
 * Extract and parse a top-level JS variable assignment from page HTML.
 * Uses the earliest occurring end delimiter to handle varied page layouts.
 * @deprecated Prefer fetchPlayerResponse() which uses the InnerTube API directly.
 */
export function extractJsonVar(
	html: string,
	varName: string
): Record<string, unknown> | null {
	const marker = `var ${varName} = `;
	const idx = html.indexOf(marker);
	if (idx === -1) {
		return null;
	}

	const jsonStart = idx + marker.length;

	const candidates = [
		html.indexOf(";</script>", jsonStart),
		html.indexOf(";var ", jsonStart),
		html.indexOf(";window[", jsonStart),
		html.indexOf(";\n", jsonStart),
	].filter((pos) => pos !== -1);

	if (candidates.length === 0) {
		return null;
	}

	const jsonEnd = Math.min(...candidates);

	try {
		return JSON.parse(html.slice(jsonStart, jsonEnd)) as Record<
			string,
			unknown
		>;
	} catch {
		return null;
	}
}
