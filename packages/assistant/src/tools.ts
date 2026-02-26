import type { AppRouterClient } from "@my-app/api/routers";
import { createMockChargeNotificationTool } from "./tools/create-mock-charge-notification";
import { createCreateTodoTool } from "./tools/create-todo";
import { createListTodosTool } from "./tools/list-todos";
import { createScheduleRecurringReminderTool } from "./tools/schedule-recurring-reminder";
import { createWhoAmITool } from "./tools/whoami";
// Admin tools
import { createAdminPipelineStatsTool } from "./tools/youtube/admin-pipeline-stats";
import { createAdminRecoverFailedTool } from "./tools/youtube/admin-recover-failed";
import { createAdminRecoverStuckTool } from "./tools/youtube/admin-recover-stuck";
// Feed management
import { createCreateFeedGameChannelTool } from "./tools/youtube/create-feed-game-channel";
import { createCreateFeedChannelAllTool } from "./tools/youtube/create-feed-channel-all";
import { createCreateFeedChannelQueryTool } from "./tools/youtube/create-feed-channel-query";
import { createCreateFeedSearchTool } from "./tools/youtube/create-feed-search";
import { createCreateFeedPlaylistTool } from "./tools/youtube/create-feed-playlist";
import { createDeleteFeedTool } from "./tools/youtube/delete-feed";
import { createListFeedsTool } from "./tools/youtube/list-feeds";
// Cluster management
import { createListClustersTool } from "./tools/youtube/list-clusters";
// Signal browsing
import { createListSignalsTool } from "./tools/youtube/list-signals";
// Video management
import { createListVideosTool } from "./tools/youtube/list-videos";
import { createRecoverStuckTool } from "./tools/youtube/recover-stuck";
import { createRetriggerNlpTool } from "./tools/youtube/retrigger-nlp";
import { createRetryIngestTool } from "./tools/youtube/retry-ingest";
import { createReviewVideoTool } from "./tools/youtube/review-video";
import { createReviewVideosBatchTool } from "./tools/youtube/review-videos-batch";
// Channel / search
import { createGetGameChannelTool } from "./tools/youtube/get-game-channel";
import { createSearchChannelsTool } from "./tools/youtube/search-channels";
import { createSearchVideosTool } from "./tools/youtube/search-videos";
import { createSemanticSearchTool } from "./tools/youtube/search-youtube";
import { createSubmitVideoTool } from "./tools/youtube/submit-video";
import { createTriggerDiscoveryTool } from "./tools/youtube/trigger-discovery";
import { createUpdateClusterStateTool } from "./tools/youtube/update-cluster-state";
import { createUpdateFeedTool } from "./tools/youtube/update-feed";
// Compound investigation
import { createInvestigateVideoTool } from "./tools/youtube/investigate-video";
// Transcript
import { createGetTranscriptTool } from "./tools/youtube/get-transcript";

export const createAssistantTools = (client: AppRouterClient) => {
	return {
		// ── General ──────────────────────────────────────────────────────────
		whoami: createWhoAmITool(client),
		listTodos: createListTodosTool(client),
		createTodo: createCreateTodoTool(client),
		scheduleRecurringReminder: createScheduleRecurringReminderTool(client),
		createMockChargeNotification: createMockChargeNotificationTool(client),

		// ── Feed management ───────────────────────────────────────────────────
		/** List all feeds (read — always start here to get feedIds) */
		ytListFeeds: createListFeedsTool(client),
		/** Monitor all game-tagged videos via YouTube's game aggregator channel (mutation) */
		ytCreateFeedGameChannel: createCreateFeedGameChannelTool(client),
		/** Index ALL uploads from a creator channel — no query filter (mutation) */
		ytCreateFeedChannelAll: createCreateFeedChannelAllTool(client),
		/** Search a specific creator channel for videos about a game (mutation) */
		ytCreateFeedChannelQuery: createCreateFeedChannelQueryTool(client),
		/** Broad YouTube-wide keyword search feed (mutation) */
		ytCreateFeedSearch: createCreateFeedSearchTool(client),
		/** Monitor a specific YouTube playlist (mutation) */
		ytCreateFeedPlaylist: createCreateFeedPlaylistTool(client),
		/** Edit an existing feed's config or status (mutation) */
		ytUpdateFeed: createUpdateFeedTool(client),
		/** Delete a feed and all its data permanently (mutation) */
		ytDeleteFeed: createDeleteFeedTool(client),
		/** Kick off a discovery run for a feed (mutation) */
		ytTriggerDiscovery: createTriggerDiscoveryTool(client),

		// ── Video pipeline ────────────────────────────────────────────────────
		/** Submit a YouTube URL to a feed as a candidate (mutation) */
		ytSubmitVideo: createSubmitVideoTool(client),
		/** List tracked videos — filter by status, title search, sort (read) */
		ytListVideos: createListVideosTool(client),
		/** Approve or reject a candidate video (mutation) */
		ytReviewVideo: createReviewVideoTool(client),
		/** Approve or reject multiple candidate videos at once (mutation) */
		ytReviewVideosBatch: createReviewVideosBatchTool(client),
		/** Retry a failed video's ingestion (mutation) */
		ytRetryIngest: createRetryIngestTool(client),
		/** Re-queue org-scoped stuck-ingesting videos (mutation) */
		ytRecoverStuck: createRecoverStuckTool(client),

		// ── Investigation (compound) ──────────────────────────────────────────
		/** Deep investigation: video + transcript + signals in one call (read) */
		ytInvestigateVideo: createInvestigateVideoTool(client),

		// ── Transcripts & signals ─────────────────────────────────────────────
		/** Get the full transcript with timestamped segments for a video (read) */
		ytGetTranscript: createGetTranscriptTool(client),
		/** List signals with structured filters and sorting (read) */
		ytListSignals: createListSignalsTool(client),
		/** Free-text + filter search across signals (read) */
		ytSemanticSearch: createSemanticSearchTool(client),
		/** Re-run NLP extraction for an already-ingested video (mutation) */
		ytRetriggerNlp: createRetriggerNlpTool(client),

		// ── Clusters ──────────────────────────────────────────────────────────
		/** List issue clusters with search and sorting (read) */
		ytListClusters: createListClustersTool(client),
		/** Update cluster state/ticket link (mutation) */
		ytUpdateClusterState: createUpdateClusterStateTool(client),

		// ── Channel / YouTube search ──────────────────────────────────────────
		/** Search YouTube channels by name or game title (read) */
		ytSearchChannels: createSearchChannelsTool(client),
		/** Search YouTube for videos by keyword — explore content, find channels, identify stop words (read) */
		ytSearchVideos: createSearchVideosTool(client),
		/** Fetch YouTube's auto-generated game metadata channel from a video's watch page (read) */
		ytGetGameChannel: createGetGameChannelTool(client),

		// ── Admin ─────────────────────────────────────────────────────────────
		/** [Admin] Pipeline health stats across all orgs (read) */
		adminYtPipelineStats: createAdminPipelineStatsTool(client),
		/** [Admin] Re-queue stuck-ingesting videos across all orgs (mutation) */
		adminYtRecoverStuck: createAdminRecoverStuckTool(client),
		/** [Admin] Re-queue transiently-failed videos across all orgs (mutation) */
		adminYtRecoverFailed: createAdminRecoverFailedTool(client),
	};
};

