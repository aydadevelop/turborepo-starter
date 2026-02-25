/** Shared YouTube InnerTube API utilities. */

import {
	evictFailedProxy,
	getProxy,
	type KVStore,
	markProxyInsufficientFlow,
	type ProxyEntry,
} from "./proxy-client";
import { fetchViaProxy } from "./proxy-fetch";

export const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── InnerTube multi-client config ───────────────────────────────────────────

type InnerTubeClientName =
	| "ANDROID_MUSIC"
	| "ANDROID_VR"
	| "IOS"
	| "TVHTML5_SIMPLY_EMBEDDED_PLAYER"
	| "ANDROID";

interface InnerTubeClientConfig {
	apiKey: string;
	clientContext: Record<string, unknown>;
	headers: Record<string, string>;
}

const INNERTUBE_BASE = "https://www.youtube.com/youtubei/v1/player";
const INSUFFICIENT_FLOW_RE = /insufficient\s+flow/i;

/** Per-client request timeout — fetchViaProxy uses raw TCP so can't use AbortSignal. */
const PER_CLIENT_TIMEOUT_MS = 12_000;

function rejectAfter(ms: number): Promise<never> {
	return new Promise((_, reject) =>
		setTimeout(
			() =>
				reject(
					Object.assign(new Error(`Timed out after ${ms}ms`), {
						name: "TimeoutError",
					})
				),
			ms
		)
	);
}

/**
 * Clients tried in order.
 *
 * ANDROID_VR (id=28) is first — yt-dlp's primary default client. Oculus/Quest
 * UA; no JS player or PO token needed. Works reliably from Cloudflare IPs.
 *
 * ANDROID_MUSIC (id=21) is second — confirmed to work from CF datacenter IPs;
 * app-specific UA is less likely to be flagged than the main YouTube client.
 *
 * IOS, TV_EMBEDDED, ANDROID kept as further fallbacks.
 */
const CLIENT_CONFIGS: [InnerTubeClientName, InnerTubeClientConfig][] = [
	[
		"ANDROID_VR",
		{
			apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
			headers: {
				"Content-Type": "application/json",
				"User-Agent":
					"com.google.android.apps.youtube.vr.oculus/1.71.26 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
				"X-YouTube-Client-Name": "28",
				"X-YouTube-Client-Version": "1.71.26",
			},
			clientContext: {
				clientName: "ANDROID_VR",
				clientVersion: "1.71.26",
				deviceMake: "Oculus",
				deviceModel: "Quest 3",
				androidSdkVersion: 32,
				osName: "Android",
				osVersion: "12L",
				hl: "en",
				gl: "US",
			},
		},
	],
	[
		"ANDROID_MUSIC",
		{
			apiKey: "AIzaSyAOghZGza2MQSZkY_zfZ370N-PUdXEo8AI",
			headers: {
				"Content-Type": "application/json",
				"User-Agent":
					"com.google.android.apps.youtube.music/5.16.51 (Linux; U; Android 11) gzip",
				"X-YouTube-Client-Name": "21",
				"X-YouTube-Client-Version": "5.16.51",
			},
			clientContext: {
				clientName: "ANDROID_MUSIC",
				clientVersion: "5.16.51",
				androidSdkVersion: 30,
				hl: "en",
				gl: "US",
			},
		},
	],
	[
		"IOS",
		{
			apiKey: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUA",
			headers: {
				"Content-Type": "application/json",
				"User-Agent":
					"com.google.ios.youtube/21.02.3 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
				"X-YouTube-Client-Name": "5",
				"X-YouTube-Client-Version": "21.02.3",
			},
			clientContext: {
				clientName: "IOS",
				clientVersion: "21.02.3",
				deviceMake: "Apple",
				deviceModel: "iPhone16,2",
				osName: "iPhone",
				osVersion: "18.3.2.22D82",
				hl: "en",
				gl: "US",
			},
		},
	],
	[
		"TVHTML5_SIMPLY_EMBEDDED_PLAYER",
		{
			apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
			headers: {
				"Content-Type": "application/json",
				"X-YouTube-Client-Name": "85",
				"X-YouTube-Client-Version": "2.0",
			},
			clientContext: {
				clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
				clientVersion: "2.0",
				hl: "en",
				gl: "US",
			},
		},
	],
	[
		"ANDROID",
		{
			apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
			headers: {
				"Content-Type": "application/json",
				"User-Agent":
					"com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip",
				"X-YouTube-Client-Name": "3",
				"X-YouTube-Client-Version": "21.02.35",
			},
			clientContext: {
				clientName: "ANDROID",
				clientVersion: "21.02.35",
				androidSdkVersion: 30,
				hl: "en",
				gl: "US",
			},
		},
	],
];

/**
 * Optional environment bindings for proxy support.
 * Pass these from the Worker env to route InnerTube requests through
 * a 2Captcha residential proxy instead of the CF datacenter IP.
 */
export interface ProxyEnv {
	/** KV namespace for caching the proxy list across invocations */
	proxyCacheKv?: KVStore;
	/** 2Captcha API key — enables residential proxy routing */
	twoCaptchaApiKey?: string;
}

export interface PlayerResponse {
	/** User-Agent of the InnerTube client that resolved the stream URLs — must match for CDN fetches. */
	clientUserAgent: string;
	data: Record<string, unknown>;
	/** The proxy used for this request, if any — pass to CDN fetches. */
	proxy: ProxyEntry | null;
}

/** Per-client timeout — prevents a hung connection from blocking the whole pipeline. */
// Note: PER_CLIENT_TIMEOUT_MS and rejectAfter() are defined near the top of this file.

/**
 * Attempt a single InnerTube client fetch — proxy-first, direct fallback.
 * Returns `null` on network/proxy error (caller should try the next client).
 */
async function attemptInnertubeClient(
	clientName: InnerTubeClientName,
	config: InnerTubeClientConfig,
	videoId: string,
	proxyRef: { value: ProxyEntry | null },
	proxyEnv: ProxyEnv | undefined
): Promise<{ res: Response; elapsed: number } | null> {
	const t0 = performance.now();
	const url = `${INNERTUBE_BASE}?key=${config.apiKey}`;
	const body = JSON.stringify({
		videoId,
		context: { client: config.clientContext },
	});
	const headers = config.headers;

	let res: Response;
	try {
		if (proxyRef.value) {
			try {
				// fetchViaProxy uses raw TCP sockets — wrap with rejectAfter for timeout
				// since AbortSignal is not threaded through the socket layer.
				res = await Promise.race([
					fetchViaProxy(url, proxyRef.value, { method: "POST", headers, body }),
					rejectAfter(PER_CLIENT_TIMEOUT_MS),
				]);
			} catch (proxyErr) {
				const proxyErrText = String(proxyErr);
				if (INSUFFICIENT_FLOW_RE.test(proxyErrText)) {
					console.warn(
						"[proxy] Detected insufficient flow from proxy provider; enabling temporary cooldown"
					);
					await markProxyInsufficientFlow(proxyEnv?.proxyCacheKv);
				}
				console.warn(
					`[proxy] Proxy fetch failed for ${clientName}, falling back to direct: ${proxyErr}`
				);
				await evictFailedProxy(proxyRef.value, proxyEnv?.proxyCacheKv);
				proxyRef.value = null;
				res = await fetch(url, {
					method: "POST",
					headers,
					body,
					signal: AbortSignal.timeout(PER_CLIENT_TIMEOUT_MS),
				});
			}
		} else {
			res = await fetch(url, {
				method: "POST",
				headers,
				body,
				signal: AbortSignal.timeout(PER_CLIENT_TIMEOUT_MS),
			});
		}
	} catch (fetchErr) {
		const elapsed = Math.round(performance.now() - t0);
		const isTimeout =
			fetchErr instanceof Error && fetchErr.name === "TimeoutError";
		const msg = `[innertube:${clientName}] ${isTimeout ? `Timed out after ${elapsed}ms` : `Network error: ${fetchErr}`}`;
		console.warn(msg);
		return null;
	}

	return { res, elapsed: Math.round(performance.now() - t0) };
}

/**
 * Fetch the InnerTube player response for a video.
 *
 * Tries multiple InnerTube clients in sequence and returns the first response
 * with playabilityStatus OK. When a `proxyEnv` is provided and a 2Captcha API
 * key is configured, the first attempt uses a residential proxy to bypass CF
 * datacenter IP bot detection. On proxy failure it falls through to direct fetch.
 *
 * Returns both the player data and the resolved proxy entry so that callers
 * can route CDN stream requests through the same residential IP.
 */
export async function fetchPlayerResponse(
	videoId: string,
	proxyEnv?: ProxyEnv
): Promise<PlayerResponse> {
	const errors: string[] = [];

	// Use an object ref so attemptInnertubeClient can clear the proxy on failure
	const proxyRef: { value: ProxyEntry | null } = {
		value: proxyEnv?.twoCaptchaApiKey
			? await getProxy(proxyEnv.twoCaptchaApiKey, proxyEnv.proxyCacheKv).catch(
					(e) => {
						console.warn("[proxy] Failed to resolve proxy entry:", e);
						return null;
					}
				)
			: null,
	};

	if (proxyRef.value) {
		console.log(
			`[proxy] Using residential proxy ${proxyRef.value.host}:${proxyRef.value.port} for videoId=${videoId}`
		);
	}

	for (const [clientName, config] of CLIENT_CONFIGS) {
		const attempt = await attemptInnertubeClient(
			clientName,
			config,
			videoId,
			proxyRef,
			proxyEnv
		);
		if (!attempt) {
			errors.push(`[innertube:${clientName}] network/proxy failure`);
			continue;
		}

		const { res, elapsed } = attempt;

		if (!res.ok) {
			const msg = `[innertube:${clientName}] HTTP ${res.status} ${res.statusText} (${elapsed}ms)`;
			console.warn(msg);
			errors.push(msg);
			continue;
		}

		const data = (await res.json()) as Record<string, unknown>;
		const playability = data.playabilityStatus as
			| Record<string, unknown>
			| undefined;
		const playStatus = (playability?.status ?? "UNKNOWN") as string;
		const playReason = playability?.reason ?? playability?.messages ?? "";

		if (playStatus !== "OK") {
			const msg = `[innertube:${clientName}] playabilityStatus=${playStatus}: ${playReason} (${elapsed}ms)`;
			console.warn(msg);
			errors.push(msg);
			continue;
		}

		if (clientName !== "ANDROID_VR") {
			console.log(
				`[innertube] Used fallback client ${clientName} for videoId=${videoId} (${elapsed}ms)`
			);
		}

		return {
			data,
			proxy: proxyRef.value,
			clientUserAgent: config.headers["User-Agent"] ?? "",
		};
	}

	throw new Error(
		`[innertube] All clients failed for videoId=${videoId}: ${errors.join(" | ")}`
	);
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
