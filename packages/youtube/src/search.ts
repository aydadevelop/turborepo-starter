import z from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const searchOptionsSchema = z.object({
	query: z.string().trim().min(1).max(500),
	maxResults: z.number().int().min(1).max(200).default(10),
	/**
	 * Approximate date filter — mapped to the closest YouTube bucket:
	 * hour | today | week | month | year.
	 * YouTube doesn't support exact ISO date filtering on the search page.
	 */
	publishedAfter: z.string().datetime({ offset: true }).optional(),
	/**
	 * Duration filter — short: <4 min, medium: 4–20 min, long: >20 min.
	 * Omit for any length.
	 */
	duration: z.enum(["short", "medium", "long"]).optional(),
	/**
	 * Words to exclude from results. Each is prepended with `-` and appended
	 * to the query string — YouTube supports this natively.
	 */
	stopWords: z.array(z.string().trim().min(1)).optional(),
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

// ─── sp (filter) protobuf encoding ───────────────────────────────────────────

/**
 * YouTube's `sp` parameter is a base64-encoded protobuf message.
 * Structure (field 2 = filter wrapper):
 *   field 1 = uploadDate  (1=hour, 2=today, 3=week, 4=month, 5=year)
 *   field 2 = type        (1=video, 2=channel, 3=playlist)
 *   field 3 = duration    (1=short <4m, 2=long >20m)
 *
 * We always set type=video. uploadDate and duration are optional.
 */
function buildSpParam(
	publishedAfter: string | undefined,
	duration: "short" | "medium" | "long" | undefined
): string {
	// Map ISO date → upload date bucket
	let uploadDate = 0;
	if (publishedAfter) {
		const msDiff = Date.now() - new Date(publishedAfter).getTime();
		const hours = msDiff / 3_600_000;
		if (hours <= 1) {
			uploadDate = 1;
		} else if (hours <= 24) {
			uploadDate = 2;
		} else if (hours <= 24 * 7) {
			uploadDate = 3;
		} else if (hours <= 24 * 31) {
			uploadDate = 4;
		} else {
			uploadDate = 5;
		}
	}

	let durationCode = 0;
	if (duration === "short") {
		durationCode = 1;
	} else if (duration === "long") {
		durationCode = 2;
	} else if (duration === "medium") {
		durationCode = 3;
	}

	// Build inner bytes: always include type=video (field 2 varint 1)
	const inner: number[] = [];
	if (uploadDate > 0) {
		inner.push(0x08, uploadDate);
	} // field 1, varint
	inner.push(0x10, 0x01); // field 2 = type = video
	if (durationCode > 0) {
		inner.push(0x18, durationCode);
	} // field 3, varint

	// Wrap in field 2 (length-delimited)
	const bytes = [0x12, inner.length, ...inner];
	return Buffer.from(bytes).toString("base64");
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
	// Build query string: append -word for each stop word
	const exclusions = (options.stopWords ?? [])
		.map((w) => `-${w.includes(" ") ? `"${w}"` : w}`)
		.join(" ");
	const query = exclusions ? `${options.query} ${exclusions}` : options.query;

	const url = new URL(YOUTUBE_SEARCH_URL);
	url.searchParams.set("q", query);
	url.searchParams.set("hl", "en");
	const spParam = buildSpParam(options.publishedAfter, options.duration);
	url.searchParams.set("sp", spParam);

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

	const results: SearchResult[] =
		collectVideoRenderers(data).map(mapVideoRenderer);

	// Follow InnerTube continuation tokens to fetch more pages when needed
	let token = extractSearchContinuationToken(data);
	while (results.length < options.maxResults && token) {
		const page = await fetchSearchContinuationPage(token, spParam);
		results.push(...page.items);
		token = page.nextToken;
	}

	return results.slice(0, options.maxResults);
}

// ─── InnerTube search continuation ───────────────────────────────────────────

const INNERTUBE_CLIENT_VERSION = "2.20240101.00.00";

function extractSearchContinuationToken(node: unknown): string | null {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = extractSearchContinuationToken(item);
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
		const found = extractSearchContinuationToken(value);
		if (found) {
			return found;
		}
	}
	return null;
}

async function fetchSearchContinuationPage(
	token: string,
	spParam: string
): Promise<{ items: SearchResult[]; nextToken: string | null }> {
	const response = await fetch("https://www.youtube.com/youtubei/v1/search", {
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
			params: spParam,
		}),
	});

	if (!response.ok) {
		return { items: [], nextToken: null };
	}

	const data = (await response.json()) as Record<string, unknown>;
	const actions = data.onResponseReceivedCommands as unknown[] | undefined;
	const appendAction = actions?.[0] as Record<string, unknown> | undefined;
	const continuationItems = (
		appendAction?.appendContinuationItemsAction as
			| Record<string, unknown>
			| undefined
	)?.continuationItems as unknown[] | undefined;

	if (!continuationItems) {
		return { items: [], nextToken: null };
	}

	const renderers = collectVideoRenderers(continuationItems);
	const nextToken = extractSearchContinuationToken(continuationItems);
	return { items: renderers.map(mapVideoRenderer), nextToken };
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
