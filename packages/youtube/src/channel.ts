import z from "zod";
import { USER_AGENT } from "./page";
import type { SearchResult } from "./search.ts";

// ─── Channel Search ───────────────────────────────────────────────────────────

export interface ChannelSearchResult {
	channelId: string;
	/** YouTube @handle, e.g. "@GameMewgenics". Null when not set. */
	handle: string | null;
	description: string | null;
	name: string;
	/** Formatted subscriber count, e.g. "128K subscribers". Null when unavailable. */
	subscriberCount: string | null;
	thumbnailUrl: string | null;
	/**
	 * Channel type inferred from YouTube structure:
	 * - "creator"  — regular upload channel with a Videos tab
	 * - "topic"    — YouTube auto-generated aggregator (no Videos tab, useless for discovery)
	 * - "unknown"  — couldn't determine
	 */
	channelType: "creator" | "topic" | "unknown";
}

/**
 * Search YouTube for channels matching the query.
 *
 * Uses the public search results page with `type=channel` filter — no API key
 * required, Cloudflare Workers compatible.
 */
export async function searchChannels(
	query: string,
	maxResults = 10
): Promise<ChannelSearchResult[]> {
	const url = new URL("https://www.youtube.com/results");
	url.searchParams.set("q", query);
	url.searchParams.set("hl", "en");
	// sp = EgIQAg== → protobuf: field2(type=channel), no date/duration filter
	url.searchParams.set("sp", "EgIQAg%3D%3D");

	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!response.ok) {
		throw new Error(`YouTube channel search failed: ${response.status}`);
	}

	const html = await response.text();
	const data = extractYtInitialData(html);
	if (!data) {
		return [];
	}

	const renderers = collectChannelRenderers(data);
	return renderers.slice(0, maxResults).map(mapChannelRenderer);
}

function collectChannelRenderers(node: unknown): Record<string, unknown>[] {
	if (!node || typeof node !== "object") {
		return [];
	}
	if (Array.isArray(node)) {
		return node.flatMap(collectChannelRenderers);
	}
	const obj = node as Record<string, unknown>;
	const results: Record<string, unknown>[] = [];
	if (
		"channelRenderer" in obj &&
		obj.channelRenderer &&
		typeof obj.channelRenderer === "object"
	) {
		results.push(obj.channelRenderer as Record<string, unknown>);
	}
	for (const value of Object.values(obj)) {
		results.push(...collectChannelRenderers(value));
	}
	return results;
}

function mapChannelRenderer(cr: Record<string, unknown>): ChannelSearchResult {
	interface Runs {
		runs?: { text: string }[];
	}
	interface SimpleText {
		simpleText?: string;
	}

	const channelId =
		(
			cr.navigationEndpoint as
				| { browseEndpoint?: { browseId?: string } }
				| undefined
		)?.browseEndpoint?.browseId ?? String(cr.channelId ?? "");

	const titleRuns = (cr.title as Runs | undefined)?.runs;
	const name =
		titleRuns?.[0]?.text ??
		(cr.title as SimpleText | undefined)?.simpleText ??
		"";

	const descRuns = (cr.descriptionSnippet as Runs | undefined)?.runs;
	const description = descRuns?.map((r) => r.text).join("") || null;

	// YouTube puts either a @handle OR the subscriber count in subscriberCountText.
	// When a channel has a handle, subscriberCountText.simpleText = "@handle"
	// and the actual subscriber count is in videoCountText.simpleText.
	const subscriberRaw =
		(cr.subscriberCountText as SimpleText | undefined)?.simpleText ?? null;
	const videoCountRaw =
		(cr.videoCountText as SimpleText | undefined)?.simpleText ?? null;

	const isHandle = subscriberRaw?.startsWith("@") ?? false;
	const handle = isHandle ? subscriberRaw : null;
	const subscriberCount = isHandle ? videoCountRaw : subscriberRaw;

	// Detect YouTube auto-generated topic channels:
	// - Name ending in " - Topic" or " - Game Topic" is canonical YouTube pattern
	// - Description saying "generated automatically" is another signal
	const isTopicChannel =
		name.endsWith(" - Topic") ||
		name.endsWith(" - Game Topic") ||
		(description?.toLowerCase().includes("generated automatically by youtube") ??
			false);
	const channelType: ChannelSearchResult["channelType"] = isTopicChannel
		? "topic"
		: "creator";

	interface Thumb {
		height?: number;
		url: string;
		width?: number;
	}
	const thumbs =
		(cr.thumbnail as { thumbnails?: Thumb[] } | undefined)?.thumbnails ?? [];
	const thumbnailUrl = thumbs.at(-1)?.url ?? null;

	return {
		channelId,
		name,
		description,
		subscriberCount,
		handle,
		channelType,
		thumbnailUrl,
	};
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const channelVideosOptionsSchema = z.object({
	/** YouTube channel ID (starts with UC…). */
	channelId: z.string().min(2),
	/**
	 * Which tab to browse:
	 * - `videos`   — all uploads, sorted by newest (default) or most popular
	 * - `recent`   — last 7 days of uploads
	 * - `letsplay` — gaming-specific Let's Play section; content is dynamic on
	 *                some channels and may return empty (requires InnerTube
	 *                browse continuation to fully load)
	 */
	tab: z.enum(["videos", "recent", "letsplay"]).default("videos"),
	/**
	 * Sort order — only applies when `tab = "videos"`.
	 * - `newest`  — newest first (default)
	 * - `popular` — most viewed first
	 */
	sort: z.enum(["newest", "popular"]).default("newest"),
	maxResults: z.number().int().min(1).max(10_000).default(10),
});

export type ChannelVideosOptions = z.input<typeof channelVideosOptionsSchema>;

const TAB_PATHS: Record<string, string> = {
	videos: "/videos",
	recent: "/recent",
	letsplay: "/letsplay",
};

// ─── InnerTube continuation ───────────────────────────────────────────────────

const INNERTUBE_CLIENT_VERSION = "2.20240101.00.00";

interface ContinuationResult {
	items: Record<string, unknown>[];
	nextToken: string | null;
}

/**
 * Recursively find the first `continuationItemRenderer` continuation token.
 * Works on both ytInitialData (initial page) and InnerTube browse responses.
 */
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

/**
 * POST to the InnerTube browse endpoint to fetch the next page of results
 * using a continuation token from a previous page.
 */
async function fetchContinuationPage(
	token: string
): Promise<ContinuationResult> {
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
		throw new Error(`InnerTube continuation fetch failed: ${response.status}`);
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
				"gridVideoRenderer" in (item as Record<string, unknown>)
		)
		.map(
			(item) =>
				(item as Record<string, unknown>).gridVideoRenderer as Record<
					string,
					unknown
				>
		);

	const nextToken = extractContinuationToken(continuationItems);
	return { items, nextToken };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch videos from a YouTube channel tab.
 *
 * Uses the public channel browse page (`ytInitialData`) for the first page,
 * then follows InnerTube continuation tokens to fetch additional pages until
 * `maxResults` is reached or no more pages are available.
 *
 * No API key required; Cloudflare Workers compatible.
 */
export async function getChannelVideos(
	options: ChannelVideosOptions
): Promise<SearchResult[]> {
	const parsed = channelVideosOptionsSchema.parse(options);
	const tabPath = TAB_PATHS[parsed.tab];
	const url = new URL(
		`https://www.youtube.com/channel/${parsed.channelId}${tabPath}`
	);
	if (parsed.tab === "videos" && parsed.sort === "popular") {
		url.searchParams.set("sort", "p");
	}

	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!response.ok) {
		throw new Error(`YouTube channel fetch failed: ${response.status}`);
	}

	const html = await response.text();
	const data = extractYtInitialData(html);
	if (!data) {
		return [];
	}

	// Collect first-page results
	const initialRenderers = collectGridVideoRenderers(data);
	const results: SearchResult[] = initialRenderers.map((vr) =>
		mapGridVideoRenderer(vr, parsed.channelId)
	);

	// Paginate via InnerTube continuation tokens until maxResults is satisfied
	let continuationToken = extractContinuationToken(data);
	while (results.length < parsed.maxResults && continuationToken) {
		const { items, nextToken } = await fetchContinuationPage(continuationToken);
		for (const item of items) {
			if (results.length >= parsed.maxResults) {
				break;
			}
			results.push(mapGridVideoRenderer(item, parsed.channelId));
		}
		continuationToken = nextToken;
	}

	return results;
}

/**
 * Search within a YouTube channel for videos matching the query.
 *
 * Fetches `https://www.youtube.com/channel/{channelId}/search?query={query}`
 * and parses the standard videoRenderer items from ytInitialData.
 * Returns up to maxResults from the first page (~20 results).
 *
 * No API key required; Cloudflare Workers compatible.
 */
export async function searchChannelVideos(options: {
	channelId: string;
	query: string;
	maxResults?: number;
}): Promise<SearchResult[]> {
	const { channelId, query, maxResults = 20 } = options;
	const url = new URL(`https://www.youtube.com/channel/${channelId}/search`);
	url.searchParams.set("query", query);

	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!response.ok) {
		throw new Error(`YouTube channel search failed: ${response.status}`);
	}

	const html = await response.text();
	const data = extractYtInitialData(html);
	if (!data) {
		return [];
	}

	const renderers = collectChannelSearchVideoRenderers(data);
	return renderers
		.slice(0, maxResults)
		.map((vr) => mapChannelSearchVideoRenderer(vr, channelId));
}

/**
 * Attempt to extract the tagged game title from a YouTube video watch page.
 *
 * Returns `null` if the video has no game tag or the page can't be fetched.
 * This requires a separate fetch per video — use only when needed.
 */
export async function getVideoGame(videoId: string): Promise<string | null> {
	const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});
	if (!response.ok) {
		return null;
	}

	const html = await response.text();
	const data = extractYtInitialData(html);
	if (!data) {
		return null;
	}

	return extractGameTitle(data);
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

/** Recursively collect every `gridVideoRenderer` object in ytInitialData. */
function collectGridVideoRenderers(node: unknown): Record<string, unknown>[] {
	if (!node || typeof node !== "object") {
		return [];
	}
	if (Array.isArray(node)) {
		return node.flatMap(collectGridVideoRenderers);
	}
	const obj = node as Record<string, unknown>;
	const results: Record<string, unknown>[] = [];
	if (
		"gridVideoRenderer" in obj &&
		obj.gridVideoRenderer &&
		typeof obj.gridVideoRenderer === "object"
	) {
		results.push(obj.gridVideoRenderer as Record<string, unknown>);
	}
	for (const value of Object.values(obj)) {
		results.push(...collectGridVideoRenderers(value));
	}
	return results;
}

function mapGridVideoRenderer(
	vr: Record<string, unknown>,
	fallbackChannelId: string
): SearchResult {
	// Title — may be { runs: [...] } or { simpleText: "..." } depending on tab
	interface Runs {
		runs?: { text: string }[];
		simpleText?: string;
	}
	const titleObj = vr.title as Runs | undefined;
	const title =
		titleObj?.runs?.[0]?.text ??
		titleObj?.simpleText ??
		String(vr.videoId ?? "");

	// Channel name + id (shortBylineText on channel pages)
	interface BylineRun {
		navigationEndpoint?: { browseEndpoint?: { browseId?: string } };
		text: string;
	}
	interface BylineText {
		runs?: BylineRun[];
	}
	const bylineRun = (vr.shortBylineText as BylineText | undefined)?.runs?.[0];
	const channelName = bylineRun?.text ?? null;
	const channelId =
		bylineRun?.navigationEndpoint?.browseEndpoint?.browseId ??
		fallbackChannelId;

	// Thumbnail — highest resolution
	interface Thumb {
		height?: number;
		url: string;
		width?: number;
	}
	const thumbs =
		(vr.thumbnail as { thumbnails?: Thumb[] } | undefined)?.thumbnails ?? [];
	const thumbnailUrl = thumbs.at(-1)?.url ?? null;

	// Duration — lives in thumbnailOverlays as thumbnailOverlayTimeStatusRenderer
	const duration = extractOverlayDuration(vr.thumbnailOverlays);

	// View count
	const viewsText =
		(vr.viewCountText as { simpleText?: string } | undefined)?.simpleText ?? "";
	const viewCount = viewsText
		? Number(viewsText.replace(/\D/g, "")) || null
		: null;

	// Published time (relative, e.g. "3 days ago")
	const publishedAt =
		(vr.publishedTimeText as { simpleText?: string } | undefined)?.simpleText ??
		null;

	return {
		channelId,
		channelName,
		description: null, // not present on channel grid pages
		duration,
		publishedAt,
		thumbnailUrl,
		title,
		viewCount,
		youtubeVideoId: String(vr.videoId ?? ""),
	};
}

/** Extract duration string from a thumbnailOverlays array. */
function extractOverlayDuration(overlays: unknown): string | null {
	if (!Array.isArray(overlays)) {
		return null;
	}
	for (const overlay of overlays) {
		if (!overlay || typeof overlay !== "object") {
			continue;
		}
		const o = overlay as Record<string, unknown>;
		const tsr = o.thumbnailOverlayTimeStatusRenderer as
			| Record<string, unknown>
			| undefined;
		if (!tsr) {
			continue;
		}
		const text = tsr.text as { simpleText?: string } | undefined;
		if (text?.simpleText) {
			return text.simpleText;
		}
	}
	return null;
}

/** Recursively find the first `gameDetailsRenderer.title.simpleText` in ytInitialData. */
function extractGameTitle(node: unknown): string | null {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = extractGameTitle(item);
			if (found) {
				return found;
			}
		}
		return null;
	}
	const obj = node as Record<string, unknown>;
	if ("gameDetailsRenderer" in obj) {
		const gdr = obj.gameDetailsRenderer as Record<string, unknown> | undefined;
		const title = gdr?.title as { simpleText?: string } | undefined;
		if (title?.simpleText) {
			return title.simpleText;
		}
	}
	for (const value of Object.values(obj)) {
		const found = extractGameTitle(value);
		if (found) {
			return found;
		}
	}
	return null;
}

// ─── Channel search helpers ───────────────────────────────────────────────────

/** Collect all `videoRenderer` objects — used in channel search result pages. */
function collectChannelSearchVideoRenderers(
	node: unknown
): Record<string, unknown>[] {
	if (!node || typeof node !== "object") {
		return [];
	}
	if (Array.isArray(node)) {
		return node.flatMap(collectChannelSearchVideoRenderers);
	}
	const obj = node as Record<string, unknown>;
	const results: Record<string, unknown>[] = [];
	if (
		"videoRenderer" in obj &&
		obj.videoRenderer &&
		typeof obj.videoRenderer === "object"
	) {
		results.push(obj.videoRenderer as Record<string, unknown>);
	}
	for (const value of Object.values(obj)) {
		results.push(...collectChannelSearchVideoRenderers(value));
	}
	return results;
}

/** Map a `videoRenderer` item (channel search format) to `SearchResult`. */
function mapChannelSearchVideoRenderer(
	vr: Record<string, unknown>,
	fallbackChannelId: string
): SearchResult {
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

	const ownerRun =
		(vr.ownerText as { runs?: BylineRun[] } | undefined)?.runs?.[0] ??
		(vr.longBylineText as { runs?: BylineRun[] } | undefined)?.runs?.[0];
	const channelName = ownerRun?.text ?? null;
	const channelId =
		ownerRun?.navigationEndpoint?.browseEndpoint?.browseId ?? fallbackChannelId;

	const thumbs =
		(vr.thumbnail as { thumbnails?: Thumb[] } | undefined)?.thumbnails ?? [];
	const thumbnailUrl = thumbs.at(-1)?.url ?? null;

	const duration =
		(vr.lengthText as { simpleText?: string } | undefined)?.simpleText ?? null;

	const viewsText =
		(vr.viewCountText as { simpleText?: string } | undefined)?.simpleText ??
		(vr.viewCountText as Runs | undefined)?.runs?.[0]?.text ??
		"";
	const viewCount = viewsText
		? Number(viewsText.replace(/\D/g, "")) || null
		: null;

	const publishedAt =
		(vr.publishedTimeText as { simpleText?: string } | undefined)?.simpleText ??
		null;

	const descRuns = (vr.descriptionSnippet as Runs | undefined)?.runs ?? [];
	const description = descRuns.map((r) => r.text).join("") || null;

	return {
		youtubeVideoId: String(vr.videoId ?? ""),
		title,
		channelId,
		channelName,
		description,
		duration,
		publishedAt,
		thumbnailUrl,
		viewCount,
	};
}
