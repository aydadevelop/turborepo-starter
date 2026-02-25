import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const ytFeedStatusValues = ["active", "paused", "archived"] as const;

export const ytVideoStatusValues = [
	"candidate",
	"approved",
	"rejected",
	"ingesting",
	"ingested",
	"failed",
] as const;

export const ytTranscriptSourceValues = [
	"youtube_captions",
	"whisper_asr",
	"manual",
] as const;

export const ytSignalTypeValues = [
	"bug",
	"ux_friction",
	"confusion",
	"praise",
	"suggestion",
	"performance",
	"crash",
	"exploit",
	"other",
] as const;

/**
 * Categories a user can toggle on/off for extraction.
 * Excludes "other" since that's a catch-all.
 */
export const ytExtractionCategoryValues = [
	"bug",
	"ux_friction",
	"confusion",
	"praise",
	"suggestion",
	"performance",
	"crash",
	"exploit",
] as const;

export type YtExtractionCategory = (typeof ytExtractionCategoryValues)[number];

export const ytSignalSeverityValues = [
	"critical",
	"high",
	"medium",
	"low",
	"info",
] as const;

export const ytClusterStateValues = [
	"open",
	"acknowledged",
	"in_progress",
	"fixed",
	"ignored",
	"regression",
] as const;

export type YtFeedStatus = (typeof ytFeedStatusValues)[number];
export type YtVideoStatus = (typeof ytVideoStatusValues)[number];
export type YtTranscriptSource = (typeof ytTranscriptSourceValues)[number];
export type YtSignalType = (typeof ytSignalTypeValues)[number];
export type YtSignalSeverity = (typeof ytSignalSeverityValues)[number];
export type YtClusterState = (typeof ytClusterStateValues)[number];

// ─── Feed ────────────────────────────────────────────────────────────────────
// A search feed definition tied to an org & game. Drives periodic discovery.

export const ytFeed = sqliteTable(
	"yt_feed",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		gameTitle: text("game_title").notNull(),
		searchQuery: text("search_query").notNull(),
		/**
		 * Optional YouTube channel ID (UCxxx…) to browse directly for this feed.
		 * When set, discovery fetches the channel's /videos (or /recent) tab
		 * instead of running a keyword search — useful for official game channels.
		 */
		channelId: text("channel_id"),
		/** Comma-separated stop-words for candidate filtering */
		stopWords: text("stop_words"),
		/** ISO date — only ingest videos published after this */
		publishedAfter: text("published_after"),
		/** Game version tag for context */
		gameVersion: text("game_version"),
		/** Cron expression or interval hint for scheduling */
		scheduleHint: text("schedule_hint"),
		/**
		 * JSON array of enabled extraction categories.
		 * null = all categories enabled (default).
		 * e.g. ["bug", "crash", "performance"] to only extract those types.
		 */
		collectCategories: text("collect_categories", { mode: "json" }).$type<
			string[] | null
		>(),
		/**
		 * When true, audio download + Whisper ASR is used when captions are unavailable.
		 * Opt-in because ASR is expensive (audio download + transcription).
		 * Default false — videos without captions will fail rather than triggering ASR.
		 */
		enableAsr: integer("enable_asr", { mode: "boolean" })
			.notNull()
			.default(false),
		status: text("status", { enum: ytFeedStatusValues })
			.notNull()
			.default("active"),
		lastDiscoveryAt: integer("last_discovery_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("yt_feed_org_idx").on(table.organizationId),
		index("yt_feed_status_idx").on(table.status),
	]
);

// ─── Video ───────────────────────────────────────────────────────────────────
// A YouTube video discovered or submitted for processing.

export const ytVideo = sqliteTable(
	"yt_video",
	{
		id: text("id").primaryKey(),
		feedId: text("feed_id")
			.notNull()
			.references(() => ytFeed.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		youtubeVideoId: text("youtube_video_id").notNull(),
		title: text("title").notNull(),
		channelId: text("channel_id"),
		channelName: text("channel_name"),
		description: text("description"),
		/** ISO 8601 duration string (e.g. "PT1H23M45S") */
		duration: text("duration"),
		publishedAt: text("published_at"),
		thumbnailUrl: text("thumbnail_url"),
		/** JSON array of tags from YouTube */
		tags: text("tags", { mode: "json" }).$type<string[]>(),
		viewCount: integer("view_count"),
		status: text("status", { enum: ytVideoStatusValues })
			.notNull()
			.default("candidate"),
		/** Why rejected, if applicable */
		rejectionReason: text("rejection_reason"),
		/** User who approved/rejected */
		reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
		/** R2 key for stored audio, if downloaded via ASR path */
		audioR2Key: text("audio_r2_key"),
		/**
		 * Whether manual (non-auto-generated) captions were found during ingest.
		 * null = not yet checked (video hasn't been ingested).
		 */
		captionsAvailable: integer("captions_available", { mode: "boolean" }),
		/**
		 * Whether auto-generated captions were found during ingest.
		 * null = not yet checked (video hasn't been ingested).
		 */
		autoCaptionsAvailable: integer("auto_captions_available", {
			mode: "boolean",
		}),
		/** Pipeline stage tracking */
		ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }),
		failureReason: text("failure_reason"),
		failedStage: text("failed_stage"),
		...timestamps,
	},
	(table) => [
		index("yt_video_feed_idx").on(table.feedId),
		index("yt_video_org_idx").on(table.organizationId),
		index("yt_video_status_idx").on(table.status),
		uniqueIndex("yt_video_feed_ytid_unique").on(
			table.feedId,
			table.youtubeVideoId
		),
	]
);

// ─── Transcript ──────────────────────────────────────────────────────────────
// A transcript extracted from a video. One video may have multiple transcripts
// (e.g. auto-captions + manual, or different languages).

export const ytTranscript = sqliteTable(
	"yt_transcript",
	{
		id: text("id").primaryKey(),
		videoId: text("video_id")
			.notNull()
			.references(() => ytVideo.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		source: text("source", { enum: ytTranscriptSourceValues }).notNull(),
		language: text("language").notNull().default("en"),
		/** R2 key for the raw transcript file (SRT/VTT/JSON) */
		r2Key: text("r2_key"),
		/** Full plain text of the transcript (for FTS5) */
		fullText: text("full_text"),
		/** JSON array of timed segments: [{start, end, text}] in seconds */
		timedSegments: text("timed_segments", { mode: "json" }).$type<
			{ start: number; end: number; text: string }[]
		>(),
		/** Total duration in seconds */
		durationSeconds: integer("duration_seconds"),
		/** Word/segment count */
		segmentCount: integer("segment_count"),
		/** Token count for LLM budgeting */
		tokenCount: integer("token_count"),
		/** NLP processing status: pending → processed → failed */
		nlpStatus: text("nlp_status", {
			enum: ["pending", "processed", "failed"] as const,
		})
			.notNull()
			.default("pending"),
		/** When NLP marking was completed */
		markedAt: integer("marked_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("yt_transcript_video_idx").on(table.videoId),
		index("yt_transcript_org_idx").on(table.organizationId),
	]
);

// ─── Cluster ─────────────────────────────────────────────────────────────────
// A group of similar signals representing a single issue/insight.

export const ytCluster = sqliteTable(
	"yt_cluster",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		summary: text("summary"),
		state: text("state", { enum: ytClusterStateValues })
			.notNull()
			.default("open"),
		type: text("type", { enum: ytSignalTypeValues }),
		severity: text("severity", { enum: ytSignalSeverityValues }),
		/** Number of unique signals in this cluster */
		signalCount: integer("signal_count").notNull().default(0),
		/** Number of unique authors/channels */
		uniqueAuthors: integer("unique_authors").notNull().default(0),
		/** Impact score: frequency × unique_authors × severity */
		impactScore: integer("impact_score").notNull().default(0),
		/** Game component affected */
		component: text("component"),
		/** Version when this was first reported */
		firstSeenVersion: text("first_seen_version"),
		/** Version when this was fixed (if state = fixed) */
		fixedInVersion: text("fixed_in_version"),
		/** Versions affected (JSON array) */
		versionsAffected: text("versions_affected", { mode: "json" }).$type<
			string[]
		>(),
		/** External tracker link (Jira, Linear, etc.) */
		externalIssueUrl: text("external_issue_url"),
		externalIssueId: text("external_issue_id"),
		...timestamps,
	},
	(table) => [
		index("yt_cluster_org_idx").on(table.organizationId),
		index("yt_cluster_state_idx").on(table.state),
		index("yt_cluster_type_idx").on(table.type),
	]
);

// ─── Signal ──────────────────────────────────────────────────────────────────
// An atomic feedback unit extracted from a transcript by NLP/LLM.

export const ytSignal = sqliteTable(
	"yt_signal",
	{
		id: text("id").primaryKey(),
		transcriptId: text("transcript_id")
			.notNull()
			.references(() => ytTranscript.id, { onDelete: "cascade" }),
		videoId: text("video_id")
			.notNull()
			.references(() => ytVideo.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		type: text("type", { enum: ytSignalTypeValues }).notNull(),
		severity: text("severity", { enum: ytSignalSeverityValues })
			.notNull()
			.default("medium"),
		/** The core extracted text snippet */
		text: text("text").notNull(),
		/** Surrounding context from transcript */
		contextBefore: text("context_before"),
		contextAfter: text("context_after"),
		/** Character offset where this signal starts in transcript fullText */
		startOffset: integer("start_offset"),
		/** Character offset where this signal ends in transcript fullText */
		endOffset: integer("end_offset"),
		/** Start time in seconds within the video */
		timestampStart: integer("timestamp_start"),
		/** End time in seconds within the video */
		timestampEnd: integer("timestamp_end"),
		/** LLM confidence score 0-100 */
		confidence: integer("confidence"),
		/** Numeric severity 0-10 from LLM (used for impact calculation) */
		severityScore: integer("severity_score"),
		/** Short reasoning why this qualifies as game feedback */
		reasoning: text("reasoning"),
		/** Game area/component this relates to */
		component: text("component"),
		/** Version the signal pertains to */
		gameVersion: text("game_version"),
		/** Cluster assignment (set during clustering) */
		clusterId: text("cluster_id").references(() => ytCluster.id, {
			onDelete: "set null",
		}),
		/** Embedding model used */
		embeddingModel: text("embedding_model"),
		/** Has this signal been vectorized? */
		vectorized: integer("vectorized", { mode: "boolean" })
			.notNull()
			.default(false),
		/** JSON array of extracted tags */
		tags: text("tags", { mode: "json" }).$type<string[]>(),
		...timestamps,
	},
	(table) => [
		index("yt_signal_transcript_idx").on(table.transcriptId),
		index("yt_signal_video_idx").on(table.videoId),
		index("yt_signal_org_idx").on(table.organizationId),
		index("yt_signal_type_idx").on(table.type),
		index("yt_signal_cluster_idx").on(table.clusterId),
		index("yt_signal_vectorized_idx").on(table.vectorized),
	]
);
