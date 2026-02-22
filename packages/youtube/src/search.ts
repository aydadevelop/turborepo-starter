import z from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const searchOptionsSchema = z.object({
	query: z.string().trim().min(1).max(500),
	maxResults: z.number().int().min(1).max(50).default(10),
	publishedAfter: z.string().optional(),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

export interface SearchResult {
	channelId: string | null;
	channelName: string | null;
	description: string | null;
	duration: string | null;
	publishedAt: string | null;
	thumbnailUrl: string | null;
	title: string;
	viewCount: number | null;
	youtubeVideoId: string;
}

// ─── Search Implementation ───────────────────────────────────────────────────

const YOUTUBE_SEARCH_URL = "https://www.youtube.com/results";
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Search YouTube for videos matching the query by scraping the public
 * search results page and parsing the embedded `ytInitialData` JSON.
 *
 * No native binary or API key required.
 */
export async function searchYouTube(
	options: SearchOptions
): Promise<SearchResult[]> {
	const url = new URL(YOUTUBE_SEARCH_URL);
	url.searchParams.set("q", options.query);
	url.searchParams.set("hl", "en");
	// EgIQAQ== = filter for videos only (exclude channels/playlists)
	url.searchParams.set("sp", "EgIQAQ%3D%3D");

	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!response.ok) {
		throw new Error(`YouTube search failed: ${response.status}`);
	}

	const html = await response.text();

	const marker = "var ytInitialData = ";
	const markerIndex = html.indexOf(marker);
	if (markerIndex === -1) {
		return [];
	}

	let data: unknown;
	try {
		const jsonStart = markerIndex + marker.length;
		const jsonEnd = html.indexOf(";</script>", jsonStart);
		if (jsonEnd === -1) {
			return [];
		}
		data = JSON.parse(html.slice(jsonStart, jsonEnd));
	} catch {
		return [];
	}

	const renderers = collectVideoRenderers(data);
	return renderers.slice(0, options.maxResults).map(mapVideoRenderer);
}

// ─── ytInitialData Parsing ────────────────────────────────────────────────────

/** Recursively collect every `videoRenderer` object in the ytInitialData tree. */
function collectVideoRenderers(node: unknown): Record<string, unknown>[] {
	if (!node || typeof node !== "object") {
		return [];
	}
	if (Array.isArray(node)) {
		return node.flatMap(collectVideoRenderers);
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
		results.push(...collectVideoRenderers(value));
	}
	return results;
}

function mapVideoRenderer(vr: Record<string, unknown>): SearchResult {
	// Title
	interface Runs {
		runs?: { text: string }[];
	}
	const titleRuns = (vr.title as Runs | undefined)?.runs;
	const title = titleRuns?.[0]?.text ?? String(vr.title ?? "");

	// Channel name + id
	interface OwnerRun {
		navigationEndpoint?: { browseEndpoint?: { browseId?: string } };
		text: string;
	}
	interface OwnerText {
		runs?: OwnerRun[];
	}
	const ownerRun = (vr.ownerText as OwnerText | undefined)?.runs?.[0];
	const channelName = ownerRun?.text ?? null;
	const channelId =
		ownerRun?.navigationEndpoint?.browseEndpoint?.browseId ?? null;

	// Thumbnail — pick highest resolution
	interface Thumb {
		height?: number;
		url: string;
		width?: number;
	}
	const thumbs =
		(vr.thumbnail as { thumbnails?: Thumb[] } | undefined)?.thumbnails ?? [];
	const thumbnailUrl = thumbs.at(-1)?.url ?? null;

	// Duration (human-readable, e.g. "12:34")
	const duration =
		(vr.lengthText as { simpleText?: string } | undefined)?.simpleText ?? null;

	// View count
	const viewsText =
		(vr.viewCountText as { simpleText?: string } | undefined)?.simpleText ?? "";
	const viewCount = viewsText
		? Number(viewsText.replace(/\D/g, "")) || null
		: null;

	// Description snippet
	const descRuns = (vr.descriptionSnippet as Runs | undefined)?.runs;
	const description = descRuns?.map((r) => r.text).join("") || null;

	// Published time (relative, e.g. "3 weeks ago")
	const publishedAt =
		(vr.publishedTimeText as { simpleText?: string } | undefined)?.simpleText ??
		null;

	return {
		youtubeVideoId: String(vr.videoId ?? ""),
		title,
		channelName,
		channelId,
		description,
		duration,
		publishedAt,
		thumbnailUrl,
		viewCount,
	};
}
