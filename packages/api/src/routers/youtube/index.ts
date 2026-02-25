import { db } from "@my-app/db";
import {
	ytCluster,
	ytFeed,
	ytSignal,
	ytTranscript,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { searchChannels } from "@my-app/youtube/channel";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import z from "zod";
import {
	channelSearchResultSchema,
	clusterOutputSchema,
	createFeedInputSchema,
	feedOutputSchema,
	getTranscriptInputSchema,
	listClustersInputSchema,
	listSignalsInputSchema,
	listVideosInputSchema,
	retriggerNlpInputSchema,
	retryIngestInputSchema,
	reviewVideoInputSchema,
	searchChannelsInputSchema,
	semanticSearchInputSchema,
	semanticSearchResultSchema,
	signalOutputSchema,
	submitVideoInputSchema,
	transcriptOutputSchema,
	triggerDiscoveryInputSchema,
	updateClusterStateInputSchema,
	updateFeedInputSchema,
	videoOutputSchema,
} from "../../contracts/youtube";
import { ytQueueKinds } from "../../contracts/youtube-queue";
import { organizationPermissionProcedure } from "../../index";
import { recoverStuckIngesting } from "../../services/youtube/recovery";
import { extractYoutubeVideoId, fetchOEmbedMetadata } from "./utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toISOStringOrNull = (d: Date | null | undefined) =>
	d ? d.toISOString() : null;

// ─── Feed Router ─────────────────────────────────────────────────────────────

const feedRouter = {
	create: organizationPermissionProcedure({ yt_feed: ["create"] })
		.route({ tags: ["YouTube Feeds"], summary: "Create a discovery feed" })
		.input(createFeedInputSchema)
		.output(feedOutputSchema)
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			const now = new Date();
			await db.insert(ytFeed).values({
				id,
				organizationId: context.activeMembership.organizationId,
				name: input.name,
				gameTitle: input.gameTitle,
				searchQuery: input.searchQuery,
				channelId: input.channelId ?? null,
				stopWords: input.stopWords,
				publishedAfter: input.publishedAfter,
				gameVersion: input.gameVersion,
				scheduleHint: input.scheduleHint,
				collectCategories: input.collectCategories ?? null,
				enableAsr: input.enableAsr ?? false,
			});
			return {
				id,
				name: input.name,
				gameTitle: input.gameTitle,
				searchQuery: input.searchQuery,
				channelId: input.channelId ?? null,
				stopWords: input.stopWords ?? null,
				publishedAfter: input.publishedAfter ?? null,
				gameVersion: input.gameVersion ?? null,
				scheduleHint: input.scheduleHint ?? null,
				collectCategories: input.collectCategories ?? null,
				enableAsr: input.enableAsr ?? false,
				status: "active" as const,
				lastDiscoveryAt: null,
				createdAt: now.toISOString(),
			};
		}),

	update: organizationPermissionProcedure({ yt_feed: ["update"] })
		.route({ tags: ["YouTube Feeds"], summary: "Update a discovery feed" })
		.input(updateFeedInputSchema)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			const { feedId, ...updates } = input;
			await db
				.update(ytFeed)
				.set(updates)
				.where(
					and(
						eq(ytFeed.id, feedId),
						eq(ytFeed.organizationId, context.activeMembership.organizationId)
					)
				);
			return { success: true };
		}),

	list: organizationPermissionProcedure({ yt_feed: ["read"] })
		.route({ tags: ["YouTube Feeds"], summary: "List discovery feeds" })
		.output(z.array(feedOutputSchema))
		.handler(async ({ context }) => {
			const feeds = await db
				.select()
				.from(ytFeed)
				.where(
					eq(ytFeed.organizationId, context.activeMembership.organizationId)
				)
				.orderBy(desc(ytFeed.createdAt));

			return feeds.map((f) => ({
				id: f.id,
				name: f.name,
				gameTitle: f.gameTitle,
				searchQuery: f.searchQuery,
				channelId: f.channelId,
				stopWords: f.stopWords,
				publishedAfter: f.publishedAfter,
				gameVersion: f.gameVersion,
				scheduleHint: f.scheduleHint,
				collectCategories: (f.collectCategories as string[] | null) ?? null,
				enableAsr: f.enableAsr,
				status: f.status,
				lastDiscoveryAt: toISOStringOrNull(f.lastDiscoveryAt),
				createdAt: f.createdAt.toISOString(),
			}));
		}),

	delete: organizationPermissionProcedure({ yt_feed: ["delete"] })
		.route({ tags: ["YouTube Feeds"], summary: "Delete a discovery feed" })
		.input(z.object({ feedId: z.string().trim().min(1) }))
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			await db
				.delete(ytFeed)
				.where(
					and(
						eq(ytFeed.id, input.feedId),
						eq(ytFeed.organizationId, context.activeMembership.organizationId)
					)
				);
			return { success: true };
		}),
};

// ─── Video Router ────────────────────────────────────────────────────────────

const videoRouter = {
	submit: organizationPermissionProcedure({ yt_video: ["create"] })
		.route({
			tags: ["YouTube Videos"],
			summary: "Submit a video URL for processing",
		})
		.input(submitVideoInputSchema)
		.output(videoOutputSchema)
		.handler(async ({ context, input }) => {
			const youtubeVideoId = extractYoutubeVideoId(input.youtubeUrl);
			if (!youtubeVideoId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid YouTube URL",
				});
			}

			// P1: Verify feedId belongs to the current organization
			const [feed] = await db
				.select({ id: ytFeed.id })
				.from(ytFeed)
				.where(
					and(
						eq(ytFeed.id, input.feedId),
						eq(ytFeed.organizationId, context.activeMembership.organizationId)
					)
				)
				.limit(1);
			if (!feed) {
				throw new ORPCError("FORBIDDEN", {
					message: "Feed does not belong to this organization",
				});
			}

			const id = crypto.randomUUID();
			const oembed = await fetchOEmbedMetadata(youtubeVideoId);
			const title = oembed?.title ?? `Pending: ${youtubeVideoId}`;
			const channelName = oembed?.channelName ?? null;

			await db.insert(ytVideo).values({
				id,
				feedId: input.feedId,
				organizationId: context.activeMembership.organizationId,
				youtubeVideoId,
				title,
				channelName,
				status: "candidate",
			});

			return {
				id,
				feedId: input.feedId,
				youtubeVideoId,
				title,
				channelName,
				description: null,
				duration: null,
				publishedAt: null,
				thumbnailUrl: null,
				tags: null,
				viewCount: null,
				status: "candidate" as const,
				captionsAvailable: null,
				autoCaptionsAvailable: null,
				audioR2Key: null,
				createdAt: new Date().toISOString(),
			};
		}),

	review: organizationPermissionProcedure({ yt_video: ["update"] })
		.route({
			tags: ["YouTube Videos"],
			summary: "Approve or reject a candidate video",
		})
		.input(reviewVideoInputSchema)
		.output(z.object({ success: z.boolean(), status: z.string() }))
		.handler(async ({ context, input }) => {
			const userId = context.session?.user?.id;
			const organizationId = context.activeMembership.organizationId;
			const newStatus = input.action === "approve" ? "approved" : "rejected";
			const [updated] = await db
				.update(ytVideo)
				.set({
					status: newStatus,
					rejectionReason:
						input.action === "reject" ? input.rejectionReason : undefined,
					reviewedByUserId: userId,
					reviewedAt: new Date(),
				})
				.where(
					and(
						eq(ytVideo.id, input.videoId),
						eq(ytVideo.organizationId, organizationId)
					)
				)
				.returning({
					youtubeVideoId: ytVideo.youtubeVideoId,
					feedId: ytVideo.feedId,
				});

			if (
				input.action === "approve" &&
				updated?.youtubeVideoId &&
				context.ytIngestQueue
			) {
				const [feed] = updated.feedId
					? await db
							.select({ enableAsr: ytFeed.enableAsr })
							.from(ytFeed)
							.where(eq(ytFeed.id, updated.feedId))
							.limit(1)
					: [];
				await context.ytIngestQueue.send(
					{
						kind: ytQueueKinds.ingest,
						videoId: input.videoId,
						organizationId,
						youtubeVideoId: updated.youtubeVideoId,
						enableAsr: feed?.enableAsr ?? false,
					},
					{ contentType: "json" }
				);
			}

			return { success: true, status: newStatus };
		}),

	retryIngest: organizationPermissionProcedure({ yt_video: ["update"] })
		.route({
			tags: ["YouTube Videos"],
			summary: "Retry ingestion for a failed video",
		})
		.input(retryIngestInputSchema)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			const organizationId = context.activeMembership.organizationId;

			const [video] = await db
				.select({
					youtubeVideoId: ytVideo.youtubeVideoId,
					status: ytVideo.status,
					feedId: ytVideo.feedId,
				})
				.from(ytVideo)
				.where(
					and(
						eq(ytVideo.id, input.videoId),
						eq(ytVideo.organizationId, organizationId)
					)
				)
				.limit(1);

			if (!video) {
				throw new ORPCError("NOT_FOUND", { message: "Video not found" });
			}
			if (video.status !== "failed") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot retry: video status is '${video.status}', expected 'failed'`,
				});
			}

			await db
				.update(ytVideo)
				.set({
					status: "approved",
					failureReason: null,
					failedStage: null,
				})
				.where(
					and(
						eq(ytVideo.id, input.videoId),
						eq(ytVideo.organizationId, organizationId)
					)
				);

			if (context.ytIngestQueue) {
				const [feed] = await db
					.select({ enableAsr: ytFeed.enableAsr })
					.from(ytFeed)
					.where(eq(ytFeed.id, video.feedId))
					.limit(1);
				await context.ytIngestQueue.send(
					{
						kind: ytQueueKinds.ingest,
						videoId: input.videoId,
						organizationId,
						youtubeVideoId: video.youtubeVideoId,
						enableAsr: feed?.enableAsr ?? false,
					},
					{ contentType: "json" }
				);
			}

			return { success: true };
		}),

	list: organizationPermissionProcedure({ yt_video: ["read"] })
		.route({ tags: ["YouTube Videos"], summary: "List videos" })
		.input(listVideosInputSchema)
		.output(z.array(videoOutputSchema))
		.handler(async ({ context, input }) => {
			const conditions = [
				eq(ytVideo.organizationId, context.activeMembership.organizationId),
			];
			if (input.feedId) {
				conditions.push(eq(ytVideo.feedId, input.feedId));
			}
			if (input.status) {
				conditions.push(eq(ytVideo.status, input.status));
			}

			const videos = await db
				.select()
				.from(ytVideo)
				.where(and(...conditions))
				.orderBy(desc(ytVideo.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			return videos.map((v) => ({
				id: v.id,
				feedId: v.feedId,
				youtubeVideoId: v.youtubeVideoId,
				title: v.title,
				channelName: v.channelName,
				description: v.description,
				duration: v.duration,
				publishedAt: v.publishedAt,
				thumbnailUrl: v.thumbnailUrl,
				tags: v.tags,
				viewCount: v.viewCount,
				status: v.status,
				captionsAvailable: v.captionsAvailable,
				autoCaptionsAvailable: v.autoCaptionsAvailable,
				audioR2Key: v.audioR2Key,
				createdAt: v.createdAt.toISOString(),
			}));
		}),

	triggerDiscovery: organizationPermissionProcedure({ yt_feed: ["update"] })
		.route({
			tags: ["YouTube Videos"],
			summary: "Trigger discovery for a feed",
		})
		.input(triggerDiscoveryInputSchema)
		.output(z.object({ queued: z.boolean() }))
		.handler(async ({ context, input }) => {
			const ytDiscoveryQueue = context.ytDiscoveryQueue;

			if (!ytDiscoveryQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Discovery queue is not available",
				});
			}

			await ytDiscoveryQueue.send(
				{
					kind: ytQueueKinds.discovery,
					feedId: input.feedId,
					organizationId: context.activeMembership.organizationId,
				},
				{ contentType: "json" }
			);

			return { queued: true };
		}),

	recoverStuck: organizationPermissionProcedure({ yt_video: ["update"] })
		.route({
			tags: ["YouTube Videos"],
			summary: "Re-queue all videos stuck in 'ingesting' status",
		})
		.input(
			z.object({
				/** Minimum age in minutes before a video is considered stuck (default: 0 = all ingesting) */
				minAgeMinutes: z.number().int().min(0).max(120).optional().default(0),
			})
		)
		.output(z.object({ requeued: z.number() }))
		.handler(async ({ context, input }) => {
			if (!context.ytIngestQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Ingest queue is not available",
				});
			}
			const requeued = await recoverStuckIngesting({
				ytIngestQueue: context.ytIngestQueue,
				stuckThresholdMs: input.minAgeMinutes * 60 * 1000,
			});
			return { requeued };
		}),
};

// ─── Transcript Router ───────────────────────────────────────────────────────

const transcriptRouter = {
	get: organizationPermissionProcedure({ yt_video: ["read"] })
		.route({
			tags: ["YouTube Transcripts"],
			summary: "Get transcript with timed segments for a video",
		})
		.input(getTranscriptInputSchema)
		.output(transcriptOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			const organizationId = context.activeMembership.organizationId;

			// Verify video belongs to org
			const [video] = await db
				.select({ id: ytVideo.id })
				.from(ytVideo)
				.where(
					and(
						eq(ytVideo.id, input.videoId),
						eq(ytVideo.organizationId, organizationId)
					)
				)
				.limit(1);

			if (!video) {
				throw new ORPCError("NOT_FOUND", { message: "Video not found" });
			}

			const [transcript] = await db
				.select({
					id: ytTranscript.id,
					videoId: ytTranscript.videoId,
					source: ytTranscript.source,
					language: ytTranscript.language,
					durationSeconds: ytTranscript.durationSeconds,
					segmentCount: ytTranscript.segmentCount,
					nlpStatus: ytTranscript.nlpStatus,
					timedSegments: ytTranscript.timedSegments,
				})
				.from(ytTranscript)
				.where(
					and(
						eq(ytTranscript.videoId, input.videoId),
						eq(ytTranscript.organizationId, organizationId)
					)
				)
				.limit(1);

			if (!transcript) {
				return null;
			}

			return {
				id: transcript.id,
				videoId: transcript.videoId,
				source: transcript.source,
				language: transcript.language,
				durationSeconds: transcript.durationSeconds,
				segmentCount: transcript.segmentCount,
				nlpStatus: transcript.nlpStatus,
				timedSegments: (transcript.timedSegments ?? []) as {
					start: number;
					end: number;
					text: string;
				}[],
			};
		}),
};

// ─── Signal Router ───────────────────────────────────────────────────────────

const signalRouter = {
	retriggerNlp: organizationPermissionProcedure({ yt_signal: ["update"] })
		.route({
			tags: ["YouTube Signals"],
			summary: "Re-extract signals for a video using the LLM pipeline",
		})
		.input(retriggerNlpInputSchema)
		.output(z.object({ queued: z.boolean(), deletedSignals: z.number() }))
		.handler(async ({ context, input }) => {
			const organizationId = context.activeMembership.organizationId;

			const [video] = await db
				.select({ id: ytVideo.id, organizationId: ytVideo.organizationId })
				.from(ytVideo)
				.where(
					and(
						eq(ytVideo.id, input.videoId),
						eq(ytVideo.organizationId, organizationId)
					)
				)
				.limit(1);

			if (!video) {
				throw new ORPCError("NOT_FOUND", { message: "Video not found" });
			}

			const [transcript] = await db
				.select({ id: ytTranscript.id })
				.from(ytTranscript)
				.where(eq(ytTranscript.videoId, input.videoId))
				.limit(1);

			if (!transcript) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"No transcript found for this video. Ingest the video first.",
				});
			}

			// Delete existing signals so re-extraction starts clean
			const deleted = await db
				.delete(ytSignal)
				.where(
					and(
						eq(ytSignal.videoId, input.videoId),
						eq(ytSignal.organizationId, organizationId)
					)
				)
				.returning({ id: ytSignal.id });

			// Reset transcript NLP status so it can be re-processed
			await db
				.update(ytTranscript)
				.set({ nlpStatus: "pending", markedAt: null })
				.where(eq(ytTranscript.id, transcript.id));

			if (!context.ytNlpQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "NLP queue is not available",
				});
			}

			await context.ytNlpQueue.send(
				{
					kind: ytQueueKinds.nlp,
					transcriptId: transcript.id,
					videoId: input.videoId,
					organizationId,
				},
				{ contentType: "json" }
			);

			return { queued: true, deletedSignals: deleted.length };
		}),

	list: organizationPermissionProcedure({ yt_signal: ["read"] })
		.route({ tags: ["YouTube Signals"], summary: "List extracted signals" })
		.input(listSignalsInputSchema)
		.output(z.array(signalOutputSchema))
		.handler(async ({ context, input }) => {
			const conditions = [
				eq(ytSignal.organizationId, context.activeMembership.organizationId),
			];
			if (input.feedId) {
				const feedVideos = await db
					.select({ id: ytVideo.id })
					.from(ytVideo)
					.where(
						and(
							eq(ytVideo.feedId, input.feedId),
							eq(
								ytVideo.organizationId,
								context.activeMembership.organizationId
							)
						)
					);
				const feedVideoIds = feedVideos.map((v) => v.id);
				if (feedVideoIds.length === 0) {
					return [];
				}
				conditions.push(inArray(ytSignal.videoId, feedVideoIds));
			}
			if (input.videoId) {
				conditions.push(eq(ytSignal.videoId, input.videoId));
			}
			if (input.type) {
				conditions.push(eq(ytSignal.type, input.type));
			}
			if (input.severity) {
				conditions.push(eq(ytSignal.severity, input.severity));
			}
			if (input.clusterId) {
				conditions.push(eq(ytSignal.clusterId, input.clusterId));
			}
			if (input.search) {
				conditions.push(like(ytSignal.text, `%${input.search}%`));
			}

			const signals = await db
				.select()
				.from(ytSignal)
				.where(and(...conditions))
				.orderBy(desc(ytSignal.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			return signals.map((s) => ({
				id: s.id,
				videoId: s.videoId,
				transcriptId: s.transcriptId,
				type: s.type,
				text: s.text,
				contextBefore: s.contextBefore,
				contextAfter: s.contextAfter,
				timestampStart: s.timestampStart,
				timestampEnd: s.timestampEnd,
				confidence: s.confidence,
				severityScore: s.severityScore,
				reasoning: s.reasoning,
				component: s.component,
				gameVersion: s.gameVersion,
				tags: s.tags ?? null,
				clusterId: s.clusterId,
				createdAt: s.createdAt.toISOString(),
			}));
		}),
};

// ─── Cluster Router ──────────────────────────────────────────────────────────

const clusterRouter = {
	list: organizationPermissionProcedure({ yt_cluster: ["read"] })
		.route({ tags: ["YouTube Clusters"], summary: "List issue clusters" })
		.input(listClustersInputSchema)
		.output(z.array(clusterOutputSchema))
		.handler(async ({ context, input }) => {
			const conditions = [
				eq(ytCluster.organizationId, context.activeMembership.organizationId),
			];
			if (input.state) {
				conditions.push(eq(ytCluster.state, input.state));
			}
			if (input.type) {
				conditions.push(eq(ytCluster.type, input.type));
			}
			if (input.severity) {
				conditions.push(eq(ytCluster.severity, input.severity));
			}

			const clusters = await db
				.select()
				.from(ytCluster)
				.where(and(...conditions))
				.orderBy(desc(ytCluster.impactScore))
				.limit(input.limit)
				.offset(input.offset);

			return clusters.map((c) => ({
				id: c.id,
				title: c.title,
				summary: c.summary,
				state: c.state,
				type: c.type,
				severity: c.severity,
				signalCount: c.signalCount,
				uniqueAuthors: c.uniqueAuthors,
				impactScore: c.impactScore,
				component: c.component,
				firstSeenVersion: c.firstSeenVersion,
				fixedInVersion: c.fixedInVersion,
				versionsAffected: c.versionsAffected,
				externalIssueUrl: c.externalIssueUrl,
				externalIssueId: c.externalIssueId,
				createdAt: c.createdAt.toISOString(),
			}));
		}),

	updateState: organizationPermissionProcedure({ yt_cluster: ["update"] })
		.route({
			tags: ["YouTube Clusters"],
			summary: "Update cluster state (Sentry-like management)",
		})
		.input(updateClusterStateInputSchema)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			await db
				.update(ytCluster)
				.set({
					state: input.state,
					fixedInVersion: input.fixedInVersion,
					externalIssueUrl: input.externalIssueUrl,
					externalIssueId: input.externalIssueId,
				})
				.where(
					and(
						eq(ytCluster.id, input.clusterId),
						eq(
							ytCluster.organizationId,
							context.activeMembership.organizationId
						)
					)
				);
			return { success: true };
		}),
};

// ─── Search Router ───────────────────────────────────────────────────────────

const searchRouter = {
	semantic: organizationPermissionProcedure({ yt_signal: ["read"] })
		.route({
			tags: ["YouTube Search"],
			summary: "Semantic search across signals (placeholder)",
		})
		.input(semanticSearchInputSchema)
		.output(z.array(semanticSearchResultSchema))
		.handler(async ({ context, input }) => {
			// TODO: Wire to Vectorize for vector similarity search.
			// Embeddings pipeline is active with text-embedding-3-small and rich metadata
			// (organizationId, videoId, type, severity, severityScore, component, confidence).
			// Requires injecting EmbeddingProvider + VectorizeIndex into the router context.
			// For now, fall back to LIKE search.
			const conditions = [
				eq(ytSignal.organizationId, context.activeMembership.organizationId),
			];
			if (input.feedId) {
				// Filter signals to those belonging to videos in the given feed
				const feedVideos = await db
					.select({ id: ytVideo.id })
					.from(ytVideo)
					.where(
						and(
							eq(ytVideo.feedId, input.feedId),
							eq(
								ytVideo.organizationId,
								context.activeMembership.organizationId
							)
						)
					);
				const feedVideoIds = feedVideos.map((v) => v.id);
				if (feedVideoIds.length === 0) {
					return [];
				}
				conditions.push(inArray(ytSignal.videoId, feedVideoIds));
			}
			if (input.type) {
				conditions.push(eq(ytSignal.type, input.type));
			}

			const signals = await db
				.select({
					id: ytSignal.id,
					text: ytSignal.text,
					videoId: ytSignal.videoId,
					timestampStart: ytSignal.timestampStart,
					type: ytSignal.type,
					severity: ytSignal.severity,
				})
				.from(ytSignal)
				.where(and(...conditions, like(ytSignal.text, `%${input.query}%`)))
				.limit(input.limit);

			// Enrich with video data (single query instead of N+1)
			const videoIds = [...new Set(signals.map((s) => s.videoId))];
			const videoMap = new Map<
				string,
				{ title: string; youtubeVideoId: string }
			>();
			if (videoIds.length > 0) {
				const videos = await db
					.select({
						id: ytVideo.id,
						title: ytVideo.title,
						youtubeVideoId: ytVideo.youtubeVideoId,
					})
					.from(ytVideo)
					.where(inArray(ytVideo.id, videoIds));
				for (const video of videos) {
					videoMap.set(video.id, video);
				}
			}

			return signals.map((s) => {
				const video = videoMap.get(s.videoId);
				return {
					signalId: s.id,
					text: s.text,
					score: 1.0, // Placeholder — real score comes from Vectorize
					videoTitle: video?.title ?? "Unknown",
					youtubeVideoId: video?.youtubeVideoId ?? "",
					timestampStart: s.timestampStart,
					type: s.type,
					severity: s.severity,
				};
			});
		}),
};

// ─── Channel Router ──────────────────────────────────────────────────────────

const channelRouter = {
	search: organizationPermissionProcedure({ yt_feed: ["read"] })
		.route({
			tags: ["YouTube Channels"],
			summary: "Search YouTube channels by name or game title",
		})
		.input(searchChannelsInputSchema)
		.output(z.array(channelSearchResultSchema))
		.handler(({ input }) => {
			return searchChannels(input.query, input.maxResults);
		}),
};

// ─── Combined YouTube Router ─────────────────────────────────────────────────

export const youtubeRouter = {
	feeds: feedRouter,
	videos: videoRouter,
	transcripts: transcriptRouter,
	signals: signalRouter,
	clusters: clusterRouter,
	search: searchRouter,
	channels: channelRouter,
};
