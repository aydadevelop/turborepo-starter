import { db } from "@my-app/db";
import {
	ytCluster,
	ytFeed,
	ytGameChannel,
	ytSignal,
	ytTranscript,
	ytUploaderChannel,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { searchChannels } from "@my-app/youtube/channel";
import { getGameChannel } from "@my-app/youtube/game-channel";
import { searchYouTube } from "@my-app/youtube/search";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	like,
	or,
} from "drizzle-orm";
import z from "zod";
import {
	channelSearchResultSchema,
	clusterOutputSchema,
	clusterStatsInputSchema,
	clusterStatsOutputSchema,
	createFeedInputSchema,
	feedOutputSchema,
	gameChannelOutputSchema,
	getClusterInputSchema,
	getGameChannelInputSchema,
	getTranscriptInputSchema,
	listClustersInputSchema,
	listSignalsInputSchema,
	listVideosInputSchema,
	recreateClustersInputSchema,
	recreateClustersOutputSchema,
	retriggerNlpInputSchema,
	retryIngestInputSchema,
	reviewVideoInputSchema,
	searchChannelsInputSchema,
	searchYouTubeVideosInputSchema,
	semanticSearchInputSchema,
	semanticSearchResultSchema,
	signalOutputSchema,
	signalStatsInputSchema,
	signalStatsOutputSchema,
	submitVideoInputSchema,
	transcriptOutputSchema,
	triggerDiscoveryInputSchema,
	updateClusterStateInputSchema,
	updateFeedInputSchema,
	vectorProjectionInputSchema,
	vectorProjectionOutputSchema,
	videoOutputSchema,
	youtubeVideoSearchResultSchema,
} from "../../contracts/youtube";
import { ytQueueKinds } from "../../contracts/youtube-queue";
import { organizationPermissionProcedure } from "../../index";
import { pacmapTo2D } from "../../services/youtube/pacmap";
import { projectTo2D } from "../../services/youtube/pca";
import { recoverStuckIngesting } from "../../services/youtube/recovery";
import { extractYoutubeVideoId, fetchOEmbedMetadata } from "./utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toISOStringOrNull = (d: Date | null | undefined) =>
	d ? d.toISOString() : null;

// ─── Feed Router ─────────────────────────────────────────────────────────────

const feedRouter = {
	create: organizationPermissionProcedure({ yt_feed: ["create"] })
		.route({
			tags: ["YouTube Feeds"],
			summary: "Create a discovery feed",
			description: [
				"Create a new feed that defines what videos to discover.",
				"Set sourceMode explicitly. Exactly ONE mode is active:",
				"- sourceMode=playlist → playlist videos only",
				"- sourceMode=user_channel_query → channel-scoped search",
				"- sourceMode=game_channel → all channel uploads",
				"- sourceMode=search → broad YouTube keyword search",
				"To cover both a channel and broad search, create two separate feeds.",
			].join("\n"),
		})
		.input(createFeedInputSchema)
		.output(feedOutputSchema)
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			const now = new Date();
			const searchQuery = input.searchQuery ?? "";

			// Upsert channel stub so the FK reference is valid and the name is stored.
			// Always run when scopeChannelId is present — omitting scopeChannelName
			// would otherwise leave no ytUploaderChannel row and violate the FK.
			if (input.scopeChannelId) {
				const channelStub = {
					id: input.scopeChannelId,
					name: input.scopeChannelName ?? input.scopeChannelId,
				};
				const channelInsert = db
					.insert(ytUploaderChannel)
					.values(channelStub);
				if (input.scopeChannelName) {
					await channelInsert.onConflictDoUpdate({
						target: ytUploaderChannel.id,
						set: { name: input.scopeChannelName },
					});
				} else {
					await channelInsert.onConflictDoNothing();
				}
			}

			await db.insert(ytFeed).values({
				id,
				organizationId: context.activeMembership.organizationId,
				name: input.name,
				gameTitle: input.gameTitle,
				sourceMode: input.sourceMode,
				searchQuery,
				scopeChannelId: input.scopeChannelId ?? null,
				playlistId: input.playlistId ?? null,
				stopWords: input.searchStopWords ?? null,
				titleStopWords: input.titleStopWords ?? null,
				publishedAfter: input.publishedAfter ?? null,
				gameVersion: input.gameVersion ?? null,
				scheduleHint: input.scheduleHint ?? null,
				collectCategories: input.collectCategories ?? null,
				enableAsr: input.enableAsr ?? false,
				minDurationSeconds: input.minDurationSeconds ?? null,
			});
			return {
				id,
				name: input.name,
				gameTitle: input.gameTitle,
				sourceMode: input.sourceMode,
				searchQuery,
				scopeChannelId: input.scopeChannelId ?? null,
				scopeChannelName: input.scopeChannelName ?? null,
				playlistId: input.playlistId ?? null,
				searchStopWords: input.searchStopWords ?? null,
				titleStopWords: input.titleStopWords ?? null,
				publishedAfter: input.publishedAfter ?? null,
				gameVersion: input.gameVersion ?? null,
				scheduleHint: input.scheduleHint ?? null,
				collectCategories: input.collectCategories ?? null,
				enableAsr: input.enableAsr ?? false,
				minDurationSeconds: input.minDurationSeconds ?? null,
				status: "active" as const,
				lastDiscoveryAt: null,
				createdAt: now.toISOString(),
			};
		}),

	update: organizationPermissionProcedure({ yt_feed: ["update"] })
		.route({
			tags: ["YouTube Feeds"],
			summary: "Update a discovery feed",
			description: [
				"Update feed configuration. Only provided fields are changed.",
				"When changing source mode, set sourceMode and provide required fields for that mode.",
				"Modes:",
				"- playlist",
				"- user_channel_query",
				"- game_channel",
				"- search",
				"Set scopeChannelId or playlistId to null to remove them.",
			].join("\n"),
		})
		.input(updateFeedInputSchema)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			const {
				feedId,
				scopeChannelId,
				scopeChannelName,
				searchStopWords,
				titleStopWords,
				...rest
			} = input;

			// Upsert channel stub when scopeChannelId is being set.
			// Must always run when a scopeChannelId is present to satisfy the FK,
			// even if scopeChannelName was not supplied.
			if (scopeChannelId) {
				const channelStub = {
					id: scopeChannelId,
					name: scopeChannelName ?? scopeChannelId,
				};
				const channelInsert = db
					.insert(ytUploaderChannel)
					.values(channelStub);
				if (scopeChannelName) {
					await channelInsert.onConflictDoUpdate({
						target: ytUploaderChannel.id,
						set: { name: scopeChannelName },
					});
				} else {
					await channelInsert.onConflictDoNothing();
				}
			}

			const updates: Partial<typeof ytFeed.$inferInsert> = {
				...rest,
			};
			if (scopeChannelId !== undefined) {
				updates.scopeChannelId = scopeChannelId;
			}
			if (searchStopWords !== undefined) {
				updates.stopWords = searchStopWords;
			}
			if (titleStopWords !== undefined) {
				updates.titleStopWords = titleStopWords;
			}

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
				.select({
					feed: ytFeed,
					channelName: ytUploaderChannel.name,
				})
				.from(ytFeed)
				.leftJoin(
					ytUploaderChannel,
					eq(ytFeed.scopeChannelId, ytUploaderChannel.id)
				)
				.where(
					eq(ytFeed.organizationId, context.activeMembership.organizationId)
				)
				.orderBy(desc(ytFeed.createdAt));

			return feeds.map(({ feed: f, channelName }) => ({
				id: f.id,
				name: f.name,
				gameTitle: f.gameTitle,
				sourceMode: f.sourceMode,
				searchQuery: f.searchQuery,
				scopeChannelId: f.scopeChannelId,
				scopeChannelName: channelName ?? null,
				playlistId: f.playlistId,
				searchStopWords: f.stopWords,
				titleStopWords: f.titleStopWords,
				publishedAfter: f.publishedAfter,
				gameVersion: f.gameVersion,
				scheduleHint: f.scheduleHint,
				collectCategories: (f.collectCategories as string[] | null) ?? null,
				enableAsr: f.enableAsr,
				minDurationSeconds: f.minDurationSeconds ?? null,
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

	recreate: organizationPermissionProcedure({ yt_cluster: ["update"] })
		.route({
			tags: ["YouTube Clusters"],
			summary: "Recreate clusters for organization (manual trigger)",
		})
		.input(recreateClustersInputSchema)
		.output(recreateClustersOutputSchema)
		.handler(async ({ context }) => {
			if (!context.ytClusterQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Cluster queue is not configured",
				});
			}

			const organizationId = context.activeMembership.organizationId;

			const [existingClusters, clusteredSignals, vectorizedSignals] = await Promise.all([
				db
					.select({ id: ytCluster.id })
					.from(ytCluster)
					.where(eq(ytCluster.organizationId, organizationId)),
				db
					.select({ id: ytSignal.id })
					.from(ytSignal)
					.where(
						and(
							eq(ytSignal.organizationId, organizationId),
							isNotNull(ytSignal.clusterId)
						)
					),
				db
					.select({ id: ytSignal.id })
					.from(ytSignal)
					.where(
						and(
							eq(ytSignal.organizationId, organizationId),
							eq(ytSignal.vectorized, true)
						)
					),
			]);

			await db
				.update(ytSignal)
				.set({ clusterId: null })
				.where(
					and(
						eq(ytSignal.organizationId, organizationId),
						isNotNull(ytSignal.clusterId)
					)
				);

			await db.delete(ytCluster).where(eq(ytCluster.organizationId, organizationId));

			const messages = vectorizedSignals.map((signal) => ({
				id: crypto.randomUUID(),
				body: {
					kind: "yt.cluster.v1" as const,
					signalId: signal.id,
					organizationId,
				},
			}));

			const CHUNK_SIZE = 25;
			for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
				const chunk = messages.slice(i, i + CHUNK_SIZE);
				await Promise.all(chunk.map((message) => context.ytClusterQueue!.send(message)));
			}

			return {
				ok: true as const,
				queuedSignals: messages.length,
				clearedClusters: existingClusters.length,
				clearedAssignments: clusteredSignals.length,
			};
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

			// Dedup: return existing record if this video is already in the feed
			const [existing] = await db
				.select()
				.from(ytVideo)
				.where(
					and(
						eq(ytVideo.feedId, input.feedId),
						eq(ytVideo.youtubeVideoId, youtubeVideoId)
					)
				)
				.limit(1);
			if (existing) {
				return {
					id: existing.id,
					feedId: existing.feedId,
					youtubeVideoId: existing.youtubeVideoId,
					title: existing.title,
					uploaderChannelId: existing.uploaderChannelId,
					uploaderChannelName: null,
					gameChannelId: existing.gameChannelId,
					description: existing.description,
					duration: existing.duration,
					publishedAt: existing.publishedAt,
					thumbnailUrl: existing.thumbnailUrl,
					tags: null,
					viewCount: existing.viewCount,
					status: existing.status,
					captionsAvailable: existing.captionsAvailable,
					autoCaptionsAvailable: existing.autoCaptionsAvailable,
					audioR2Key: existing.audioR2Key ?? null,
					rejectionReason: existing.rejectionReason,
					createdAt: existing.createdAt.toISOString(),
				};
			}

			const id = crypto.randomUUID();
			const oembed = await fetchOEmbedMetadata(youtubeVideoId);
			const title = oembed?.title ?? `Pending: ${youtubeVideoId}`;
			const uploaderChannelName = oembed?.channelName ?? null;

			await db.insert(ytVideo).values({
				id,
				feedId: input.feedId,
				organizationId: context.activeMembership.organizationId,
				youtubeVideoId,
				title,
				status: "candidate",
			});

			return {
				id,
				feedId: input.feedId,
				youtubeVideoId,
				title,
				uploaderChannelId: null,
				uploaderChannelName,
				gameChannelId: null,
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
				rejectionReason: null,
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
			if (input.id) {
				conditions.push(eq(ytVideo.id, input.id));
			}
			if (input.feedId) {
				conditions.push(eq(ytVideo.feedId, input.feedId));
			}
			if (input.status) {
				conditions.push(eq(ytVideo.status, input.status));
			}
			if (input.search) {
				conditions.push(like(ytVideo.title, `%${input.search}%`));
			}

			const sortDir = input.sortDir ?? "desc";
			const orderBy = (() => {
				const dir = sortDir === "asc" ? asc : desc;
				switch (input.sortBy) {
					case "publishedAt":
						return dir(ytVideo.publishedAt);
					case "viewCount":
						return dir(ytVideo.viewCount);
					default:
						return dir(ytVideo.createdAt);
				}
			})();

			const videos = await db
				.select({
					video: ytVideo,
					uploaderChannelName: ytUploaderChannel.name,
				})
				.from(ytVideo)
				.leftJoin(
					ytUploaderChannel,
					eq(ytVideo.uploaderChannelId, ytUploaderChannel.id)
				)
				.where(and(...conditions))
				.orderBy(orderBy)
				.limit(input.limit)
				.offset(input.offset);

			return videos.map(({ video: v, uploaderChannelName }) => ({
				id: v.id,
				feedId: v.feedId,
				youtubeVideoId: v.youtubeVideoId,
				title: v.title,
				uploaderChannelId: v.uploaderChannelId,
				uploaderChannelName: uploaderChannelName ?? null,
				gameChannelId: v.gameChannelId,
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
				rejectionReason: v.rejectionReason,
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
			if (input.clustered === true) {
				conditions.push(isNotNull(ytSignal.clusterId));
			} else if (input.clustered === false) {
				conditions.push(isNull(ytSignal.clusterId));
			}
			if (input.search) {
				conditions.push(like(ytSignal.text, `%${input.search}%`));
			}

			const orderBy = (() => {
				const dir = (input.sortDir ?? "desc") === "asc" ? asc : desc;
				switch (input.sortBy) {
					case "confidence":
						return dir(ytSignal.confidence);
					case "severityScore":
						return dir(ytSignal.severityScore);
					default:
						return dir(ytSignal.createdAt);
				}
			})();

			const signals = await db
				.select()
				.from(ytSignal)
				.where(and(...conditions))
				.orderBy(orderBy)
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

	stats: organizationPermissionProcedure({ yt_signal: ["read"] })
		.route({
			tags: ["YouTube Signals"],
			summary: "Get aggregate signal counts",
		})
		.input(signalStatsInputSchema)
		.output(signalStatsOutputSchema)
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
					return { total: 0 };
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
			if (input.clustered === true) {
				conditions.push(isNotNull(ytSignal.clusterId));
			} else if (input.clustered === false) {
				conditions.push(isNull(ytSignal.clusterId));
			}
			if (input.search) {
				conditions.push(like(ytSignal.text, `%${input.search}%`));
			}

			const [stats] = await db
				.select({ total: count() })
				.from(ytSignal)
				.where(and(...conditions));

			return { total: stats?.total ?? 0 };
		}),
};

// ─── Cluster Router ──────────────────────────────────────────────────────────

const toClusterOutput = (cluster: typeof ytCluster.$inferSelect) => ({
	id: cluster.id,
	title: cluster.title,
	summary: cluster.summary,
	state: cluster.state,
	type: cluster.type,
	severity: cluster.severity,
	signalCount: cluster.signalCount,
	uniqueAuthors: cluster.uniqueAuthors,
	impactScore: cluster.impactScore,
	component: cluster.component,
	firstSeenVersion: cluster.firstSeenVersion,
	fixedInVersion: cluster.fixedInVersion,
	versionsAffected: cluster.versionsAffected,
	externalIssueUrl: cluster.externalIssueUrl,
	externalIssueId: cluster.externalIssueId,
	createdAt: cluster.createdAt.toISOString(),
});

const clusterRouter = {
	get: organizationPermissionProcedure({ yt_cluster: ["read"] })
		.route({ tags: ["YouTube Clusters"], summary: "Get issue cluster by ID" })
		.input(getClusterInputSchema)
		.output(clusterOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			const [cluster] = await db
				.select()
				.from(ytCluster)
				.where(
					and(
						eq(ytCluster.id, input.clusterId),
						eq(
							ytCluster.organizationId,
							context.activeMembership.organizationId
						)
					)
				)
				.limit(1);

			if (!cluster) {
				return null;
			}

			return toClusterOutput(cluster);
		}),

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
			if (input.search) {
				const searchCondition = or(
					like(ytCluster.title, `%${input.search}%`),
					like(ytCluster.summary, `%${input.search}%`)
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
			}

			const orderBy = (() => {
				const dir = (input.sortDir ?? "desc") === "asc" ? asc : desc;
				switch (input.sortBy) {
					case "signalCount":
						return dir(ytCluster.signalCount);
					case "createdAt":
						return dir(ytCluster.createdAt);
					default:
						return dir(ytCluster.impactScore);
				}
			})();

			const clusters = await db
				.select()
				.from(ytCluster)
				.where(and(...conditions))
				.orderBy(orderBy)
				.limit(input.limit)
				.offset(input.offset);

			return clusters.map(toClusterOutput);
		}),

	stats: organizationPermissionProcedure({ yt_cluster: ["read"] })
		.route({
			tags: ["YouTube Clusters"],
			summary: "Get aggregate cluster counts",
		})
		.input(clusterStatsInputSchema)
		.output(clusterStatsOutputSchema)
		.handler(async ({ context, input }) => {
			const conditions = [
				eq(ytCluster.organizationId, context.activeMembership.organizationId),
			];
			if (input.type) {
				conditions.push(eq(ytCluster.type, input.type));
			}
			if (input.severity) {
				conditions.push(eq(ytCluster.severity, input.severity));
			}
			if (input.search) {
				const searchCondition = or(
					like(ytCluster.title, `%${input.search}%`),
					like(ytCluster.summary, `%${input.search}%`)
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
			}

			const grouped = await db
				.select({ state: ytCluster.state, total: count() })
				.from(ytCluster)
				.where(and(...conditions))
				.groupBy(ytCluster.state);

			const byState = {
				open: 0,
				acknowledged: 0,
				in_progress: 0,
				fixed: 0,
				ignored: 0,
				regression: 0,
			};

			for (const row of grouped) {
				const state = row.state as keyof typeof byState;
				if (state in byState) {
					byState[state] = row.total;
				}
			}

			const total =
				byState.open +
				byState.acknowledged +
				byState.in_progress +
				byState.fixed +
				byState.ignored +
				byState.regression;

			return { total, byState };
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

	recreate: organizationPermissionProcedure({ yt_cluster: ["update"] })
		.route({
			tags: ["YouTube Clusters"],
			summary: "Recreate clusters for organization (manual trigger)",
		})
		.input(recreateClustersInputSchema)
		.output(recreateClustersOutputSchema)
		.handler(async ({ context }) => {
			if (!context.ytClusterQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Cluster queue is not configured",
				});
			}

			const organizationId = context.activeMembership.organizationId;

			const [existingClusters, clusteredSignals, vectorizedSignals] =
				await Promise.all([
					db
						.select({ id: ytCluster.id })
						.from(ytCluster)
						.where(eq(ytCluster.organizationId, organizationId)),
					db
						.select({ id: ytSignal.id })
						.from(ytSignal)
						.where(
							and(
								eq(ytSignal.organizationId, organizationId),
								isNotNull(ytSignal.clusterId)
							)
						),
					db
						.select({ id: ytSignal.id })
						.from(ytSignal)
						.where(
							and(
								eq(ytSignal.organizationId, organizationId),
								eq(ytSignal.vectorized, true)
							)
						),
				]);

			await db
				.update(ytSignal)
				.set({ clusterId: null })
				.where(
					and(
						eq(ytSignal.organizationId, organizationId),
						isNotNull(ytSignal.clusterId)
					)
				);

			await db
				.delete(ytCluster)
				.where(eq(ytCluster.organizationId, organizationId));

			// Purge stale centroid vectors from Vectorize so they don't crowd out
			// new centroids during re-clustering (topK would otherwise return only stale ones).
			if (context.ytVectorize?.deleteByIds && existingClusters.length > 0) {
				const centroidIds = existingClusters.map((c) => `centroid:${c.id}`);
				const VEC_CHUNK = 100;
				for (let i = 0; i < centroidIds.length; i += VEC_CHUNK) {
					await context.ytVectorize.deleteByIds(centroidIds.slice(i, i + VEC_CHUNK));
				}
				console.info(`[yt-cluster] Purged ${centroidIds.length} stale centroid(s) from Vectorize`);
			}

			const messages = vectorizedSignals.map((signal) => ({
				kind: "yt.cluster.v1" as const,
				signalId: signal.id,
				organizationId,
			}));

			const CHUNK_SIZE = 25;
			for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
				const chunk = messages.slice(i, i + CHUNK_SIZE);
				await Promise.all(
					chunk.map((msg) => context.ytClusterQueue!.send(msg, { contentType: "json" }))
				);
			}

			return {
				ok: true as const,
				queuedSignals: messages.length,
				clearedClusters: existingClusters.length,
				clearedAssignments: clusteredSignals.length,
			};
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
			if (input.severity) {
				conditions.push(eq(ytSignal.severity, input.severity));
			}
			if (input.component) {
				conditions.push(like(ytSignal.component, `%${input.component}%`));
			}

			const signals = await db
				.select({
					id: ytSignal.id,
					text: ytSignal.text,
					videoId: ytSignal.videoId,
					timestampStart: ytSignal.timestampStart,
					type: ytSignal.type,
					severity: ytSignal.severity,
					component: ytSignal.component,
					reasoning: ytSignal.reasoning,
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
					component: s.component,
					reasoning: s.reasoning,
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

	searchVideos: organizationPermissionProcedure({ yt_feed: ["read"] })
		.route({
			tags: ["YouTube Channels"],
			summary: "Search YouTube for videos by keyword",
		})
		.input(searchYouTubeVideosInputSchema)
		.output(z.array(youtubeVideoSearchResultSchema))
		.handler(async ({ input }) => {
			const results = await searchYouTube({
				query: input.query,
				maxResults: input.maxResults,
				duration: input.duration,
				stopWords: input.stopWords,
			});
			return results.map((r) => ({
				youtubeVideoId: r.youtubeVideoId,
				title: r.title,
				channelId: r.channelId,
				channelName: r.channelName,
				description: r.description,
				duration: r.duration,
				publishedAt: r.publishedAt,
				viewCount: r.viewCount,
				thumbnailUrl: r.thumbnailUrl,
			}));
		}),

	getGameChannel: organizationPermissionProcedure({ yt_feed: ["read"] })
		.route({
			tags: ["YouTube Channels"],
			summary: "Extract the game channel from a YouTube video's watch page",
			description:
				"Fetches the YouTube watch page for the given video and extracts the game's dedicated channel (UC…) from the videoDescriptionGamingSectionRenderer. Returns null for non-gaming videos.",
		})
		.input(getGameChannelInputSchema)
		.output(gameChannelOutputSchema)
		.handler(async ({ input }) => {
			try {
				const result = await getGameChannel(input.youtubeVideoId);
				if (result) {
					// Persist game channel metadata so it can be referenced later
					await db
						.insert(ytGameChannel)
						.values({
							id: result.channelId,
							title: result.title,
							metaFetchedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: ytGameChannel.id,
							set: { title: result.title, metaFetchedAt: new Date() },
						});
				}
				return result ?? null;
			} catch (err) {
				console.error("[getGameChannel] error:", err);
				return null;
			}
		}),
};

// ─── Combined YouTube Router ─────────────────────────────────────────────────

const vectorRouter = {
	projection: organizationPermissionProcedure({ yt_signal: ["read"] })
		.route({
			tags: ["YouTube Vectors"],
			summary: "Get 2D PCA projection of signal embedding vectors",
		})
		.input(vectorProjectionInputSchema)
		.output(vectorProjectionOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = context.activeMembership.organizationId;

			// 1. Fetch vectorized signal IDs + metadata from DB
			const signals = await db
				.select({
					id: ytSignal.id,
					type: ytSignal.type,
					clusterId: ytSignal.clusterId,
					confidence: ytSignal.confidence,
					severityScore: ytSignal.severityScore,
					severity: ytSignal.severity,
					component: ytSignal.component,
					text: ytSignal.text,
				})
				.from(ytSignal)
				.where(
					and(
						eq(ytSignal.organizationId, organizationId),
						eq(ytSignal.vectorized, true)
					)
				)
				.limit(input.limit);

			if (signals.length === 0) {
				return { points: [], totalVectorized: 0 };
			}

			// 2. Retrieve raw vectors from Vectorize binding
			if (!context.ytVectorize) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: "Vectorize index is not available",
				});
			}

			// Vectorize getByIds has a max of 20 IDs per call — batch accordingly
			const ids = signals.map((s) => s.id);
			const BATCH_SIZE = 20;
			const batches: string[][] = [];
			for (let i = 0; i < ids.length; i += BATCH_SIZE) {
				batches.push(ids.slice(i, i + BATCH_SIZE));
			}
			const vectorResults = (
				await Promise.all(
					batches.map((batch) => context.ytVectorize!.getByIds(batch))
				)
			).flat();

			// Build a map of id → values
			const vectorMap = new Map<string, number[]>();
			for (const v of vectorResults) {
				if (v.values) {
					vectorMap.set(v.id, Array.from(v.values));
				}
			}

			// Filter to signals that have vectors
			const matched = signals.filter((s) => vectorMap.has(s.id));
			const rawVectors = matched.map((s) => vectorMap.get(s.id)!);

			if (rawVectors.length < 2) {
				return {
					points: matched.map((s) => ({
						id: s.id,
						x: 0,
						y: 0,
						type: s.type,
						clusterId: s.clusterId,
						severity: s.severity,
						confidence: s.confidence,
						severityScore: s.severityScore,
						component: s.component,
						text: s.text.slice(0, 120),
					})),
					totalVectorized: signals.length,
				};
			}

			// 3. Project to 2D via selected method
			const projected =
				input.method === "pacmap"
					? pacmapTo2D(rawVectors)
					: projectTo2D(rawVectors);

			const points = matched.map((s, i) => ({
				id: s.id,
				x: projected[i]!.x,
				y: projected[i]!.y,
				type: s.type,
				clusterId: s.clusterId,
				severity: s.severity,
				confidence: s.confidence,
				severityScore: s.severityScore,
				component: s.component,
				text: s.text.slice(0, 120),
			}));

			return { points, totalVectorized: signals.length };
		}),
};

export const youtubeRouter = {
	feeds: feedRouter,
	videos: videoRouter,
	transcripts: transcriptRouter,
	signals: signalRouter,
	clusters: clusterRouter,
	search: searchRouter,
	channels: channelRouter,
	vectors: vectorRouter,
};
