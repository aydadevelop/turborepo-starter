import z from "zod";

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

// ─── Feed Contracts ──────────────────────────────────────────────────────────

export const createFeedInputSchema = z.object({
	name: z.string().trim().min(1).max(200),
	gameTitle: z.string().trim().min(1).max(200),
	searchQuery: z.string().trim().min(1).max(500),
	/**
	 * YouTube channel ID (UCxxx…) to browse directly instead of searching.
	 * Discovery will fetch the channel's /videos tab when this is provided.
	 */
	channelId: z
		.string()
		.trim()
		.regex(/^UC[\w-]{22}$/)
		.optional(),
	stopWords: z.string().trim().max(2000).optional(),
	publishedAfter: z.string().trim().optional(),
	gameVersion: z.string().trim().max(50).optional(),
	scheduleHint: z.string().trim().max(100).optional(),
});

export const updateFeedInputSchema = z.object({
	feedId: z.string().trim().min(1),
	name: z.string().trim().min(1).max(200).optional(),
	searchQuery: z.string().trim().min(1).max(500).optional(),
	channelId: z
		.string()
		.trim()
		.regex(/^UC[\w-]{22}$/)
		.nullable()
		.optional(),
	stopWords: z.string().trim().max(2000).optional(),
	publishedAfter: z.string().trim().optional(),
	gameVersion: z.string().trim().max(50).optional(),
	scheduleHint: z.string().trim().max(100).optional(),
	status: ytFeedStatusSchema.optional(),
});

export const feedOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	gameTitle: z.string(),
	searchQuery: z.string(),
	channelId: z.string().nullable(),
	stopWords: z.string().nullable(),
	publishedAfter: z.string().nullable(),
	gameVersion: z.string().nullable(),
	scheduleHint: z.string().nullable(),
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

export const listVideosInputSchema = z.object({
	feedId: z.string().trim().min(1).optional(),
	status: ytVideoStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

export const videoOutputSchema = z.object({
	id: z.string(),
	feedId: z.string(),
	youtubeVideoId: z.string(),
	title: z.string(),
	channelName: z.string().nullable(),
	description: z.string().nullable(),
	duration: z.string().nullable(),
	publishedAt: z.string().nullable(),
	thumbnailUrl: z.string().nullable(),
	tags: z.array(z.string()).nullable(),
	viewCount: z.number().nullable(),
	status: ytVideoStatusSchema,
	createdAt: z.string(),
});

// ─── Signal Contracts ────────────────────────────────────────────────────────

export const listSignalsInputSchema = z.object({
	videoId: z.string().trim().min(1).optional(),
	feedId: z.string().trim().min(1).optional(),
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	clusterId: z.string().trim().min(1).optional(),
	search: z.string().trim().max(500).optional(),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

export const signalOutputSchema = z.object({
	id: z.string(),
	videoId: z.string(),
	transcriptId: z.string(),
	type: ytSignalTypeSchema,
	severity: ytSignalSeveritySchema,
	text: z.string(),
	contextBefore: z.string().nullable(),
	contextAfter: z.string().nullable(),
	timestampStart: z.number().nullable(),
	timestampEnd: z.number().nullable(),
	confidence: z.number().nullable(),
	component: z.string().nullable(),
	gameVersion: z.string().nullable(),
	clusterId: z.string().nullable(),
	createdAt: z.string(),
});

// ─── Cluster Contracts ───────────────────────────────────────────────────────

export const listClustersInputSchema = z.object({
	state: ytClusterStateSchema.optional(),
	type: ytSignalTypeSchema.optional(),
	severity: ytSignalSeveritySchema.optional(),
	search: z.string().trim().max(500).optional(),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

export const updateClusterStateInputSchema = z.object({
	clusterId: z.string().trim().min(1),
	state: ytClusterStateSchema,
	fixedInVersion: z.string().trim().max(50).optional(),
	externalIssueUrl: z.string().trim().url().optional(),
	externalIssueId: z.string().trim().max(200).optional(),
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
});

// ─── Discovery Trigger ───────────────────────────────────────────────────────

export const triggerDiscoveryInputSchema = z.object({
	feedId: z.string().trim().min(1),
});
