import { USER_AGENT } from "./page";
import type { SearchResult } from "./search.ts";

/**
 * Fetch videos from a YouTube playlist.
 *
 * Scrapes the public playlist page (`ytInitialData`) for the first page,
 * then follows InnerTube continuation tokens to fetch additional pages until
 * `maxResults` is reached or no more items are available.
 *
 * No API key required; Cloudflare Workers compatible.
 */
export async function getPlaylistVideos(options: {
	playlistId: string;
	maxResults?: number;
}): Promise<SearchResult[]> {
	const maxResults = options.maxResults ?? 50;
	const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(options.playlistId)}`;

	const response = await fetch(url, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!response.ok) {
		throw new Error(`YouTube playlist fetch failed: ${response.status}`);
	}

	const html = await response.text();
	const data = extractYtInitialData(html);
	if (!data) {
		return [];
	}

	// Collect first-page results
	const initialRenderers = collectPlaylistVideoRenderers(data);
	const results: SearchResult[] = initialRenderers
		.slice(0, maxResults)
		.map(mapPlaylistVideoRenderer);

	// Paginate via InnerTube continuation tokens
	let continuationToken = extractContinuationToken(data);
	while (results.length < maxResults && continuationToken) {
		const { items, nextToken } =
			await fetchPlaylistContinuationPage(continuationToken);
		for (const item of items) {
			if (results.length >= maxResults) {
				break;
			}
			results.push(mapPlaylistVideoRenderer(item));
		}
		continuationToken = nextToken;
	}

	return results;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractYtInitialData(html: string): Record<string, unknown> | null {
	const marker = "var ytInitialData = ";
	const start = html.indexOf(marker);
	if (start === -1) {
		return null;
	}
	const jsonStart = start + marker.length;
	const jsonEnd = html.indexOf(";</script>", jsonStart);
	if (jsonEnd === -1) {
		return null;
	}
	try {
		return JSON.parse(html.slice(jsonStart, jsonEnd)) as Record<
			string,
			unknown
		>;
	} catch {
		return null;
	}
}

function extractContinuationToken(node: unknown): string | null {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = extractContinuationToken(item);
			if (found) {
				return found;
			}
		}
		return null;
	}
	const obj = node as Record<string, unknown>;
	if ("continuationItemRenderer" in obj) {
		const cir = obj.continuationItemRenderer as
			| Record<string, unknown>
			| undefined;
		const cmd = (
			cir?.continuationEndpoint as Record<string, unknown> | undefined
		)?.continuationCommand as Record<string, unknown> | undefined;
		if (cmd?.token && typeof cmd.token === "string") {
			return cmd.token;
		}
	}
	for (const value of Object.values(obj)) {
		const found = extractContinuationToken(value);
		if (found) {
			return found;
		}
	}
	return null;
}

function collectPlaylistVideoRenderers(
	node: unknown
): Record<string, unknown>[] {
	if (!node || typeof node !== "object") {
		return [];
	}
	if (Array.isArray(node)) {
		return node.flatMap(collectPlaylistVideoRenderers);
	}
	const obj = node as Record<string, unknown>;
	const results: Record<string, unknown>[] = [];
	if (
		"playlistVideoRenderer" in obj &&
		obj.playlistVideoRenderer &&
		typeof obj.playlistVideoRenderer === "object"
	) {
		results.push(obj.playlistVideoRenderer as Record<string, unknown>);
	}
	for (const value of Object.values(obj)) {
		results.push(...collectPlaylistVideoRenderers(value));
	}
	return results;
}

const INNERTUBE_CLIENT_VERSION = "2.20240101.00.00";

async function fetchPlaylistContinuationPage(token: string): Promise<{
	items: Record<string, unknown>[];
	nextToken: string | null;
}> {
	const response = await fetch("https://www.youtube.com/youtubei/v1/browse", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
			"X-YouTube-Client-Name": "1",
			"X-YouTube-Client-Version": INNERTUBE_CLIENT_VERSION,
		},
		body: JSON.stringify({
			context: {
				client: {
					clientName: "WEB",
					clientVersion: INNERTUBE_CLIENT_VERSION,
					hl: "en",
				},
			},
			continuation: token,
		}),
	});

	if (!response.ok) {
		throw new Error(
			`InnerTube playlist continuation fetch failed: ${response.status}`
		);
	}

	const data = (await response.json()) as Record<string, unknown>;
	const actions = data.onResponseReceivedActions as unknown[] | undefined;
	const appendAction = actions?.[0] as Record<string, unknown> | undefined;
	const continuationItems = (
		appendAction?.appendContinuationItemsAction as
			| Record<string, unknown>
			| undefined
	)?.continuationItems as unknown[] | undefined;

	if (!continuationItems) {
		return { items: [], nextToken: null };
	}

	const items = continuationItems
		.filter(
			(item): item is Record<string, unknown> =>
				item !== null &&
				typeof item === "object" &&
				!Array.isArray(item) &&
				"playlistVideoRenderer" in (item as Record<string, unknown>)
		)
		.map(
			(item) =>
				(item as Record<string, unknown>).playlistVideoRenderer as Record<
					string,
					unknown
				>
		);

	const nextToken = extractContinuationToken(continuationItems);
	return { items, nextToken };
}

function mapPlaylistVideoRenderer(vr: Record<string, unknown>): SearchResult {
	interface Runs {
		runs?: { text: string }[];
	}
	interface BylineRun {
		navigationEndpoint?: { browseEndpoint?: { browseId?: string } };
		text: string;
	}
	interface Thumb {
		height?: number;
		url: string;
		width?: number;
	}

	const title =
		(vr.title as Runs | undefined)?.runs?.[0]?.text ?? String(vr.videoId ?? "");

	const bylineRun = (vr.shortBylineText as { runs?: BylineRun[] } | undefined)
		?.runs?.[0];
	const channelName = bylineRun?.text ?? null;
	const channelId =
		bylineRun?.navigationEndpoint?.browseEndpoint?.browseId ?? null;

	const thumbs =
		(vr.thumbnail as { thumbnails?: Thumb[] } | undefined)?.thumbnails ?? [];
	const thumbnailUrl = thumbs.at(-1)?.url ?? null;

	const duration =
		(vr.lengthText as { simpleText?: string } | undefined)?.simpleText ?? null;

	// videoInfo runs: ["X views", " • ", "X years ago"]
	const infoRuns = (vr.videoInfo as Runs | undefined)?.runs ?? [];
	const viewsText = infoRuns[0]?.text ?? "";
	const viewCount = viewsText
		? Number(viewsText.replace(/\D/g, "")) || null
		: null;

	return {
		youtubeVideoId: String(vr.videoId ?? ""),
		title,
		channelId,
		channelName,
		description: null,
		duration,
		publishedAt: null,
		thumbnailUrl,
		viewCount,
	};
}
