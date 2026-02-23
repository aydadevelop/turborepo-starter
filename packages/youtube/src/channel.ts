import z from "zod";
import { USER_AGENT } from "./page";
import type { SearchResult } from "./search.ts";

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
	maxResults: z.number().int().min(1).max(50).default(10),
});

export type ChannelVideosOptions = z.input<typeof channelVideosOptionsSchema>;

const TAB_PATHS: Record<string, string> = {
	videos: "/videos",
	recent: "/recent",
	letsplay: "/letsplay",
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch videos from a YouTube channel tab.
 *
 * Uses the public channel browse page (`ytInitialData`) — no API key required,
 * Cloudflare Workers compatible.
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

	const renderers = collectGridVideoRenderers(data);
	return renderers
		.slice(0, parsed.maxResults)
		.map((vr) => mapGridVideoRenderer(vr, parsed.channelId));
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
	// Title
	interface Runs {
		runs?: { text: string }[];
	}
	const titleRuns = (vr.title as Runs | undefined)?.runs;
	const title = titleRuns?.[0]?.text ?? String(vr.title ?? "");

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
