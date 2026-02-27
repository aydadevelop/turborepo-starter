import z from "zod";

const YT_PLAYLIST_ID_RE = /^(PL|UU|LL|FL|RD)[\w-]+$/;
const YT_PLAYLIST_PLACEHOLDER_RE = /^(PL|UU|LL|FL|RD)0+$/;

// ─── Shared YouTube Domain Schemas ───────────────────────────────────────────

export const ytSignalTypeSchema = z.enum([
	"bug",
	"ux_friction",
	"confusion",
	"praise",
	"suggestion",
	"performance",
	"crash",
	"exploit",
	"other",
]);

export const ytSignalSeveritySchema = z.enum([
	"critical",
	"high",
	"medium",
	"low",
	"info",
]);

export const ytClusterStateSchema = z.enum([
	"open",
	"acknowledged",
	"in_progress",
	"fixed",
	"ignored",
	"regression",
]);

export const ytVideoStatusSchema = z.enum([
	"candidate",
	"approved",
	"rejected",
	"ingesting",
	"ingested",
	"failed",
]);

export const ytFeedStatusSchema = z.enum(["active", "paused", "archived"]);
export const ytFeedSourceModeSchema = z.enum([
	"search",
	"game_channel",
	"user_channel",
	"user_channel_query",
	"playlist",
]);

/** Categories a user can toggle on/off for extraction. */
export const ytExtractionCategorySchema = z.enum([
	"bug",
	"ux_friction",
	"confusion",
	"praise",
	"suggestion",
	"performance",
	"crash",
	"exploit",
]);

export type YtExtractionCategory = z.infer<typeof ytExtractionCategorySchema>;

// ─── Feed Contracts ──────────────────────────────────────────────────────────

const addCustomIssue = (
	ctx: z.RefinementCtx,
	path: (string | number)[],
	message: string
) => {
	ctx.addIssue({
		code: z.ZodIssueCode.custom,
		path,
		message,
	});
};

const validateCreateSearchMode = (
	ctx: z.RefinementCtx,
	flags: {
		hasSearchQuery: boolean;
		hasScopeChannel: boolean;
		hasPlaylist: boolean;
	}
) => {
	if (!flags.hasSearchQuery) {
		addCustomIssue(
			ctx,
			["searchQuery"],
			"searchQuery is required for sourceMode=search."
		);
	}
	if (flags.hasScopeChannel) {
		addCustomIssue(
			ctx,
			["scopeChannelId"],
			"scopeChannelId is not used for sourceMode=search."
		);
	}
	if (flags.hasPlaylist) {
		addCustomIssue(
			ctx,
			["playlistId"],
			"playlistId is not used for sourceMode=search."
		);
	}
};

const validateCreateGameChannelMode = (
	ctx: z.RefinementCtx,
	flags: {
		hasSearchQuery: boolean;
		hasScopeChannel: boolean;
		hasPlaylist: boolean;
	}
) => {
	if (!flags.hasScopeChannel) {
		addCustomIssue(
			ctx,
			["scopeChannelId"],
			"scopeChannelId is required for sourceMode=game_channel."
		);
	}
	if (flags.hasSearchQuery) {
		addCustomIssue(
			ctx,
			["searchQuery"],
			"searchQuery is not used for sourceMode=game_channel."
		);
	}
	if (flags.hasPlaylist) {
		addCustomIssue(
			ctx,
			["playlistId"],
			"playlistId is not used for sourceMode=game_channel."
		);
	}
};

const validateCreateUserChannelMode = (
	ctx: z.RefinementCtx,
	flags: {
		hasSearchQuery: boolean;
		hasScopeChannel: boolean;
		hasPlaylist: boolean;
	}
) => {
	if (!flags.hasScopeChannel) {
		addCustomIssue(
			ctx,
			["scopeChannelId"],
			"scopeChannelId is required for sourceMode=user_channel."
		);
	}
	if (flags.hasSearchQuery) {
		addCustomIssue(
			ctx,
			["searchQuery"],
			"searchQuery is not used for sourceMode=user_channel. Use user_channel_query if you need a query filter."
		);
	}
	if (flags.hasPlaylist) {
		addCustomIssue(
			ctx,
			["playlistId"],
			"playlistId is not used for sourceMode=user_channel."
		);
	}
};

const validateCreateUserChannelQueryMode = (
	ctx: z.RefinementCtx,
	flags: {
		hasSearchQuery: boolean;
		hasScopeChannel: boolean;
		hasPlaylist: boolean;
	}
) => {
	if (!flags.hasScopeChannel) {
		addCustomIssue(
			ctx,
			["scopeChannelId"],
			"scopeChannelId is required for sourceMode=user_channel_query."
		);
	}
	if (!flags.hasSearchQuery) {
		addCustomIssue(
			ctx,
			["searchQuery"],
			"searchQuery is required for sourceMode=user_channel_query."
		);
	}
	if (flags.hasPlaylist) {
		addCustomIssue(
			ctx,
			["playlistId"],
			"playlistId is not used for sourceMode=user_channel_query."
		);
	}
};

const validateCreatePlaylistMode = (
	ctx: z.RefinementCtx,
	flags: {
		hasSearchQuery: boolean;
		hasScopeChannel: boolean;
		hasPlaylist: boolean;
	}
) => {
	if (!flags.hasPlaylist) {
		addCustomIssue(
			ctx,
			["playlistId"],
			"playlistId is required for sourceMode=playlist."
		);
	}
	if (flags.hasScopeChannel) {
		addCustomIssue(
			ctx,
			["scopeChannelId"],
			"scopeChannelId is not used for sourceMode=playlist."
		);
	}
	if (flags.hasSearchQuery) {
		addCustomIssue(
			ctx,
			["searchQuery"],
			"searchQuery is not used for sourceMode=playlist."
		);
	}
};

export const createFeedInputSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		gameTitle: z.string().trim().min(1).max(200),
		/** Required discovery mode discriminator. */
		sourceMode: ytFeedSourceModeSchema,
		/**
		 * Search query used by sourceMode:
		 * - search: required
		 * - user_channel_query: required
		 * - game_channel / playlist: must be omitted
		 */
		searchQuery: z
			.string()
			.trim()
			.max(500)
			.optional()
			.describe(
				"YouTube keyword search query. Required for sourceMode=search and sourceMode=user_channel_query. For sourceMode=search it runs as a broad YouTube search."
			),
		/**
		 * YouTube channel ID (UC…) for sourceMode:
		 * - game_channel: required
		 * - user_channel_query: required
		 * - search / playlist: must be omitted
		 */
		scopeChannelId: z
			.string()
			.trim()
			.regex(/^UC[\w-]{22}$/)
			.optional()
			.describe(
				"YouTube channel ID (UC…) to scope discovery to — browse or search this channel's uploads. Use ytSearchChannels to find channel IDs. Do NOT confuse with a game channel from ytGetGameChannel."
			),
		/** Display name for the scope channel — provide this when you know it (e.g. from ytSearchVideos topChannels). */
		scopeChannelName: z.string().trim().min(1).max(200).optional(),

		/**
		 * YouTube playlist ID (PLxxx…) for sourceMode=playlist.
		 */
		playlistId: z
			.string()
			.trim()
			.regex(YT_PLAYLIST_ID_RE)
			.refine(
				(v) => !YT_PLAYLIST_PLACEHOLDER_RE.test(v),
				"Playlist ID appears to be a placeholder. Only provide a real playlist ID from an actual YouTube playlist URL."
			)
			.optional()
			.describe(
				"YouTube playlist ID (PL…). ONLY set this if you have a real playlist URL from the user — NEVER invent or guess a playlist ID."
			),
		searchStopWords: z
			.string()
			.trim()
			.max(2000)
			.optional()
			.describe(
				"Comma-separated query exclusions applied only for sourceMode=search (appended as -word in YouTube search query)."
			),
		titleStopWords: z
			.string()
			.trim()
			.max(2000)
			.optional()
			.describe(
				"Comma-separated words to filter out by video title after discovery, across all source modes."
			),
		publishedAfter: z.string().trim().optional(),
		gameVersion: z.string().trim().max(50).optional(),
		scheduleHint: z.string().trim().max(100).optional(),
		/** null/undefined = all categories enabled (default). */
		collectCategories: z.array(ytExtractionCategorySchema).optional(),
		/**
		 * Enable audio download + Whisper ASR as fallback when captions are unavailable.
		 * Default false — opt-in because ASR is expensive.
		 */
		enableAsr: z.boolean().optional(),
		/**
		 * Minimum video duration in seconds. Videos shorter than this are excluded
		 * during discovery (e.g. 60 to skip Shorts, 300 to skip trailers).
		 * null/undefined = no minimum.
		 */
		minDurationSeconds: z.number().int().min(1).max(86_400).optional(),
	})
	.superRefine((input, ctx) => {
		const hasSearchQuery = Boolean(input.searchQuery);
		const hasScopeChannel = Boolean(input.scopeChannelId);
		const hasPlaylist = Boolean(input.playlistId);
		const flags = { hasSearchQuery, hasScopeChannel, hasPlaylist };

		if (input.scopeChannelName && !input.scopeChannelId) {
			addCustomIssue(
				ctx,
				["scopeChannelName"],
				"scopeChannelName requires scopeChannelId."
			);
		}

		switch (input.sourceMode) {
			case "search":
				validateCreateSearchMode(ctx, flags);
				break;
			case "game_channel":
				validateCreateGameChannelMode(ctx, flags);
				break;
			case "user_channel":
				validateCreateUserChannelMode(ctx, flags);
				break;
			case "user_channel_query":
				validateCreateUserChannelQueryMode(ctx, flags);
				break;
			case "playlist":
				validateCreatePlaylistMode(ctx, flags);
				break;
			default:
				break;
		}
	});

export const updateFeedInputSchema = z
	.object({
		feedId: z.string().trim().min(1),
		name: z.string().trim().min(1).max(200).optional(),
		sourceMode: ytFeedSourceModeSchema.optional(),
		searchQuery: z
			.string()
			.trim()
			.max(500)
			.optional()
			.describe(
				"YouTube keyword search query for sourceMode=search or sourceMode=user_channel_query. Set to an empty string when switching to game_channel/playlist modes."
			),
		scopeChannelId: z
			.string()
			.trim()
			.regex(/^UC[\w-]{22}$/)
			.nullable()
			.optional()
			.describe(
				"YouTube channel ID (UC…) to scope discovery to. Use ytSearchChannels to find channel IDs. Set null to remove."
			),
		/** Display name for the scope channel — provide when known. */
		scopeChannelName: z.string().trim().min(1).max(200).nullable().optional(),
		playlistId: z
			.string()
			.trim()
			.regex(YT_PLAYLIST_ID_RE)
			.refine(
				(v) => !YT_PLAYLIST_PLACEHOLDER_RE.test(v),
				"Playlist ID appears to be a placeholder. Only provide a real playlist ID from an actual YouTube playlist URL."
			)
			.nullable()
			.optional()
			.describe(
				"YouTube playlist ID (PL…). ONLY set this if you have a real playlist URL from the user — NEVER invent or guess a playlist ID. Set null to remove."
			),
		searchStopWords: z
			.string()
			.trim()
			.max(2000)
			.nullable()
			.optional()
			.describe(
				"Comma-separated query exclusions applied only for sourceMode=search."
			),
		titleStopWords: z
			.string()
			.trim()
			.max(2000)
			.nullable()
			.optional()
			.describe("Comma-separated title exclusions applied after discovery."),
		publishedAfter: z.string().trim().optional(),
		gameVersion: z.string().trim().max(50).optional(),
		scheduleHint: z.string().trim().max(100).optional(),
		status: ytFeedStatusSchema.optional(),
		collectCategories: z
			.array(ytExtractionCategorySchema)
			.nullable()
			.optional(),
		enableAsr: z.boolean().optional(),
		/** Minimum video duration in seconds (null = no minimum). */
		minDurationSeconds: z.number().int().min(1).nullable().optional(),
	})
	.superRefine((input, ctx) => {
		if (input.scopeChannelName && !input.scopeChannelId) {
			addCustomIssue(
				ctx,
				["scopeChannelName"],
				"scopeChannelName requires scopeChannelId."
			);
		}
		if (!input.sourceMode) {
			return;
		}

		const hasSearchQuery = Boolean(input.searchQuery);
		const hasScopeChannel = Boolean(input.scopeChannelId);
		const hasPlaylist = Boolean(input.playlistId);

		switch (input.sourceMode) {
			case "search":
				if (!hasSearchQuery) {
					addCustomIssue(
						ctx,
						["searchQuery"],
						"Provide searchQuery when setting sourceMode=search in update."
					);
				}
				break;
			case "game_channel":
				if (!hasScopeChannel) {
					addCustomIssue(
						ctx,
						["scopeChannelId"],
						"Provide scopeChannelId when setting sourceMode=game_channel in update."
					);
				}
				break;
			case "user_channel":
				if (!hasScopeChannel) {
					addCustomIssue(
						ctx,
						["scopeChannelId"],
						"Provide scopeChannelId when setting sourceMode=user_channel in update."
					);
				}
				break;
			case "user_channel_query":
				if (!hasScopeChannel) {
					addCustomIssue(
						ctx,
						["scopeChannelId"],
						"Provide scopeChannelId when setting sourceMode=user_channel_query in update."
					);
				}
				if (!hasSearchQuery) {
					addCustomIssue(
						ctx,
						["searchQuery"],
						"Provide searchQuery when setting sourceMode=user_channel_query in update."
					);
				}
				break;
			case "playlist":
				if (!hasPlaylist) {
					addCustomIssue(
						ctx,
						["playlistId"],
						"Provide playlistId when setting sourceMode=playlist in update."
					);
				}
				break;
			default:
				break;
		}
	});

export const feedOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	gameTitle: z.string(),
	sourceMode: ytFeedSourceModeSchema,
	searchQuery: z.string(),
	scopeChannelId: z.string().nullable(),
	scopeChannelName: z.string().nullable(),
	playlistId: z.string().nullable(),
	searchStopWords: z.string().nullable(),
	titleStopWords: z.string().nullable(),
	publishedAfter: z.string().nullable(),
	gameVersion: z.string().nullable(),
	scheduleHint: z.string().nullable(),
	collectCategories: z.array(z.string()).nullable(),
	enableAsr: z.boolean(),
	minDurationSeconds: z.number().int().nullable(),
	status: ytFeedStatusSchema,
	lastDiscoveryAt: z.string().nullable(),
	createdAt: z.string(),
});

// ─── Video Contracts ─────────────────────────────────────────────────────────

export const submitVideoInputSchema = z.object({
	feedId: z.string().trim().min(1),
	youtubeUrl: z.string().trim().url(),
});

export const reviewVideoInputSchema = z.object({
	videoId: z.string().trim().min(1),
	action: z.enum(["approve", "reject"]),
	rejectionReason: z.string().trim().max(500).optional(),
});

export const retryIngestInputSchema = z.object({
	videoId: z.string().trim().min(1),
});

export const ytVideoSortByValues = [
	"createdAt",
	"publishedAt",
	"viewCount",
] as const;
export const ytSignalSortByValues = [
	"createdAt",
	"confidence",
	"severityScore",
] as const;
export const ytClusterSortByValues = [
	"impactScore",
	"signalCount",
	"createdAt",
] as const;
export const sortDirValues = ["asc", "desc"] as const;

export const listVideosInputSchema = z.object({
	/** Look up a single video by internal ID */
	id: z.string().trim().min(1).optional(),
	feedId: z.string().trim().min(1).optional(),
	status: ytVideoStatusSchema.optional(),
	/** Full-text search on video title */
	search: z.string().trim().max(500).optional(),
	sortBy: z.enum(ytVideoSortByValues).optional().default("createdAt"),
	sortDir: z.enum(sortDirValues).optional().default("desc"),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

export const videoOutputSchema = z.object({
	id: z.string(),
	feedId: z.string(),
	youtubeVideoId: z.string(),
	title: z.string(),
	/** Uploader's YouTube channel ID. Who posted the video. */
	uploaderChannelId: z.string().nullable(),
	uploaderChannelName: z.string().nullable(),
	/** The game's dedicated YouTube channel ID, inherited from the feed. */
	gameChannelId: z.string().nullable(),
	description: z.string().nullable(),
	duration: z.string().nullable(),
	publishedAt: z.string().nullable(),
	thumbnailUrl: z.string().nullable(),
	tags: z.array(z.string()).nullable(),
	viewCount: z.number().nullable(),
	status: ytVideoStatusSchema,
	/** Whether manual captions were found. null = not yet checked. */
	captionsAvailable: z.boolean().nullable(),
	/** Whether auto-generated captions were found. null = not yet checked. */
	autoCaptionsAvailable: z.boolean().nullable(),
	/** R2 key for stored audio, set after ASR download. null = no audio. */
	audioR2Key: z.string().nullable(),
	/** Reason provided when the video was manually rejected. null otherwise. */
	rejectionReason: z.string().nullable(),
	createdAt: z.string(),
});

// ─── Transcript Contracts ────────────────────────────────────────────────────

export const getTranscriptInputSchema = z.object({
	videoId: z.string().trim().min(1),
});

export const timedSegmentSchema = z.object({
	start: z.number(),
	end: z.number(),
	text: z.string(),
});

export const transcriptOutputSchema = z.object({
	id: z.string(),
	videoId: z.string(),
	source: z.string(),
	language: z.string(),
	durationSeconds: z.number().nullable(),
	segmentCount: z.number().nullable(),
	nlpStatus: z.string(),
	timedSegments: z.array(timedSegmentSchema),
});

// ─── Signal Contracts ────────────────────────────────────────────────────────

export const retriggerNlpInputSchema = z.object({
	videoId: z.string().trim().min(1),
});

export const listSignalsInputSchema = z.object({
	videoId: z.string().trim().min(1).optional(),
	feedId: z.string().trim().min(1).optional(),
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	clusterId: z.string().trim().min(1).optional(),
	/**
	 * Cluster membership filter:
	 * - true: only clustered signals
	 * - false: only unclustered signals
	 * - undefined: all signals
	 */
	clustered: z.boolean().optional(),
	/** Full-text search on signal text */
	search: z.string().trim().max(500).optional(),
	sortBy: z.enum(ytSignalSortByValues).optional().default("createdAt"),
	sortDir: z.enum(sortDirValues).optional().default("desc"),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

export const signalStatsInputSchema = z.object({
	videoId: z.string().trim().min(1).optional(),
	feedId: z.string().trim().min(1).optional(),
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	clusterId: z.string().trim().min(1).optional(),
	clustered: z.boolean().optional(),
	search: z.string().trim().max(500).optional(),
});

export const signalStatsOutputSchema = z.object({
	total: z.number().int().nonnegative(),
});

export const signalOutputSchema = z.object({
	id: z.string(),
	videoId: z.string(),
	transcriptId: z.string(),
	type: ytSignalTypeSchema,
	text: z.string(),
	contextBefore: z.string().nullable(),
	contextAfter: z.string().nullable(),
	timestampStart: z.number().nullable(),
	timestampEnd: z.number().nullable(),
	confidence: z.number().nullable(),
	severityScore: z.number().nullable(),
	reasoning: z.string().nullable(),
	component: z.string().nullable(),
	gameVersion: z.string().nullable(),
	tags: z.array(z.string()).nullable(),
	clusterId: z.string().nullable(),
	createdAt: z.string(),
});

// ─── Cluster Contracts ───────────────────────────────────────────────────────

export const listClustersInputSchema = z.object({
	state: ytClusterStateSchema.optional(),
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	/** Full-text search on cluster title and summary */
	search: z.string().trim().max(500).optional(),
	sortBy: z.enum(ytClusterSortByValues).optional().default("impactScore"),
	sortDir: z.enum(sortDirValues).optional().default("desc"),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

export const clusterStatsInputSchema = z.object({
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	/** Full-text search on cluster title and summary */
	search: z.string().trim().max(500).optional(),
});

export const clusterStateCountsSchema = z.object({
	open: z.number().int().nonnegative(),
	acknowledged: z.number().int().nonnegative(),
	in_progress: z.number().int().nonnegative(),
	fixed: z.number().int().nonnegative(),
	ignored: z.number().int().nonnegative(),
	regression: z.number().int().nonnegative(),
});

export const clusterStatsOutputSchema = z.object({
	total: z.number().int().nonnegative(),
	byState: clusterStateCountsSchema,
});

export const getClusterInputSchema = z.object({
	clusterId: z.string().trim().min(1),
});

export const updateClusterStateInputSchema = z.object({
	clusterId: z.string().trim().min(1),
	state: ytClusterStateSchema,
	fixedInVersion: z.string().trim().max(50).optional(),
	externalIssueUrl: z.string().trim().url().optional(),
	externalIssueId: z.string().trim().max(200).optional(),
});

export const recreateClustersInputSchema = z.object({
	confirm: z.literal("RECREATE"),
});

export const recreateClustersOutputSchema = z.object({
	ok: z.literal(true),
	queuedSignals: z.number().int().nonnegative(),
	clearedClusters: z.number().int().nonnegative(),
	clearedAssignments: z.number().int().nonnegative(),
});

export const refreshVectorMetadataInputSchema = z.object({
	confirm: z.literal("SYNC_METADATA"),
});

export const refreshVectorMetadataOutputSchema = z.object({
	ok: z.literal(true),
	signalVectorsUpdated: z.number().int().nonnegative(),
	centroidVectorsUpdated: z.number().int().nonnegative(),
	missingSignalVectors: z.number().int().nonnegative(),
	missingCentroidVectors: z.number().int().nonnegative(),
});

export const clusterOutputSchema = z.object({
	id: z.string(),
	title: z.string(),
	summary: z.string().nullable(),
	state: ytClusterStateSchema,
	type: ytSignalTypeSchema.nullable(),
	severity: ytSignalSeveritySchema.nullable(),
	signalCount: z.number(),
	uniqueAuthors: z.number(),
	impactScore: z.number(),
	component: z.string().nullable(),
	firstSeenVersion: z.string().nullable(),
	fixedInVersion: z.string().nullable(),
	versionsAffected: z.array(z.string()).nullable(),
	externalIssueUrl: z.string().nullable(),
	externalIssueId: z.string().nullable(),
	createdAt: z.string(),
});

// ─── Search / Retrieval Contracts ────────────────────────────────────────────

export const semanticSearchInputSchema = z.object({
	query: z.string().trim().min(1).max(1000),
	feedId: z.string().trim().min(1).optional(),
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	/** Filter by affected component (partial match) */
	component: z.string().trim().max(200).optional(),
	limit: z.number().int().min(1).max(50).default(10),
});

export const semanticSearchResultSchema = z.object({
	signalId: z.string(),
	text: z.string(),
	score: z.number(),
	videoTitle: z.string(),
	youtubeVideoId: z.string(),
	timestampStart: z.number().nullable(),
	type: ytSignalTypeSchema,
	severity: ytSignalSeveritySchema,
	component: z.string().nullable(),
	reasoning: z.string().nullable(),
});

// ─── Discovery Trigger ───────────────────────────────────────────────────────

export const triggerDiscoveryInputSchema = z.object({
	feedId: z.string().trim().min(1),
});

// ─── Channel Search ───────────────────────────────────────────────────────────

export const searchChannelsInputSchema = z.object({
	query: z.string().trim().min(1).max(200),
	maxResults: z.number().int().min(1).max(20).default(10),
});

export const channelSearchResultSchema = z.object({
	channelId: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	/** Formatted subscriber count string, e.g. "128K subscribers". Null when unavailable. */
	subscriberCount: z.string().nullable(),
	/** YouTube @handle, e.g. "@EdmundMcMillenGames". Null when not set (e.g. topic channels). */
	handle: z.string().nullable(),
	thumbnailUrl: z.string().nullable(),
	/**
	 * Channel type — determines which feed sourceMode this channel suits:
	 * - "creator" — real uploader channel. Use as scopeChannelId for sourceMode=user_channel_query.
	 * - "topic"   — YouTube game / music aggregator page. Use as scopeChannelId for sourceMode=game_channel.
	 *               These are the same channels ytGetGameChannel returns — they have a Videos tab with game-tagged content.
	 *               Do NOT use for user_channel_query (no original uploads).
	 * - "unknown" — could not determine; inspect description before use.
	 */
	channelType: z.enum(["creator", "topic", "unknown"]),
});

// ─── YouTube Video Search ─────────────────────────────────────────────────────

export const searchYouTubeVideosInputSchema = z.object({
	query: z.string().trim().min(1).max(500),
	maxResults: z.number().int().min(1).max(50).default(10),
	duration: z.enum(["short", "medium", "long"]).optional(),
	stopWords: z.array(z.string().trim().min(1)).optional(),
});

export const youtubeVideoSearchResultSchema = z.object({
	youtubeVideoId: z.string(),
	title: z.string(),
	channelId: z.string().nullable(),
	channelName: z.string().nullable(),
	description: z.string().nullable(),
	duration: z.string().nullable(),
	publishedAt: z.string().nullable(),
	viewCount: z.number().nullable(),
	thumbnailUrl: z.string().nullable(),
});

// ─── Game Channel Extraction ─────────────────────────────────────────────────

export const getGameChannelInputSchema = z.object({
	youtubeVideoId: z
		.string()
		.trim()
		.regex(/^[a-zA-Z0-9_-]{11}$/, "Invalid YouTube video ID"),
});

export const gameChannelOutputSchema = z
	.object({
		/** The game's YouTube channel ID (UC…) — use as gameChannelId in ytCreateFeed */
		channelId: z.string(),
		/** Game title as displayed on YouTube (e.g. "Mewgenics") */
		title: z.string(),
	})
	.nullable();

// ─── Vector Projection ──────────────────────────────────────────────────────

export const vectorProjectionInputSchema = z.object({
	limit: z.number().int().min(1).max(5000).default(500),
	method: z.enum(["pca", "pacmap"]).default("pca"),
});

export const vectorProjectionPointSchema = z.object({
	id: z.string(),
	x: z.number(),
	y: z.number(),
	type: z.string(),
	clusterId: z.string().nullable(),
	severity: z.string().nullable(),
	confidence: z.number().nullable(),
	severityScore: z.number().nullable(),
	component: z.string().nullable(),
	text: z.string(),
});

export const vectorProjectionOutputSchema = z.object({
	points: z.array(vectorProjectionPointSchema),
	totalVectorized: z.number(),
});
