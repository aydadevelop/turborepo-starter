import { db } from "@my-app/db";
import {
	ytCluster,
	ytFeed,
	ytSignal,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, like } from "drizzle-orm";
import z from "zod";
import {
	clusterOutputSchema,
	createFeedInputSchema,
	feedOutputSchema,
	listClustersInputSchema,
	listSignalsInputSchema,
	listVideosInputSchema,
	reviewVideoInputSchema,
	semanticSearchInputSchema,
	semanticSearchResultSchema,
	signalOutputSchema,
	submitVideoInputSchema,
	triggerDiscoveryInputSchema,
	updateClusterStateInputSchema,
	updateFeedInputSchema,
	videoOutputSchema,
} from "../../contracts/youtube";
import { organizationPermissionProcedure } from "../../index";
import { extractYoutubeVideoId } from "./utils";

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
				stopWords: input.stopWords,
				publishedAfter: input.publishedAfter,
				gameVersion: input.gameVersion,
				scheduleHint: input.scheduleHint,
			});
			return {
				id,
				name: input.name,
				gameTitle: input.gameTitle,
				searchQuery: input.searchQuery,
				stopWords: input.stopWords ?? null,
				publishedAfter: input.publishedAfter ?? null,
				gameVersion: input.gameVersion ?? null,
				scheduleHint: input.scheduleHint ?? null,
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
				stopWords: f.stopWords,
				publishedAfter: f.publishedAfter,
				gameVersion: f.gameVersion,
				scheduleHint: f.scheduleHint,
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

			const id = crypto.randomUUID();
			await db.insert(ytVideo).values({
				id,
				feedId: input.feedId,
				organizationId: context.activeMembership.organizationId,
				youtubeVideoId,
				title: `Pending: ${youtubeVideoId}`,
				status: "candidate",
			});

			return {
				id,
				feedId: input.feedId,
				youtubeVideoId,
				title: `Pending: ${youtubeVideoId}`,
				channelName: null,
				description: null,
				duration: null,
				publishedAt: null,
				thumbnailUrl: null,
				tags: null,
				viewCount: null,
				status: "candidate" as const,
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
			const newStatus = input.action === "approve" ? "approved" : "rejected";
			await db
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
						eq(ytVideo.organizationId, context.activeMembership.organizationId)
					)
				);
			return { success: true, status: newStatus };
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
					kind: "yt.discovery.v1" as const,
					feedId: input.feedId,
					organizationId: context.activeMembership.organizationId,
				},
				{ contentType: "json" }
			);

			return { queued: true };
		}),
};

// ─── Signal Router ───────────────────────────────────────────────────────────

const signalRouter = {
	list: organizationPermissionProcedure({ yt_signal: ["read"] })
		.route({ tags: ["YouTube Signals"], summary: "List extracted signals" })
		.input(listSignalsInputSchema)
		.output(z.array(signalOutputSchema))
		.handler(async ({ context, input }) => {
			const conditions = [
				eq(ytSignal.organizationId, context.activeMembership.organizationId),
			];
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
				severity: s.severity,
				text: s.text,
				contextBefore: s.contextBefore,
				contextAfter: s.contextAfter,
				timestampStart: s.timestampStart,
				timestampEnd: s.timestampEnd,
				confidence: s.confidence,
				component: s.component,
				gameVersion: s.gameVersion,
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
			// TODO: Wire to Vectorize once embeddings pipeline is active.
			// For now, fall back to FTS5 / LIKE search.
			const conditions = [
				eq(ytSignal.organizationId, context.activeMembership.organizationId),
			];
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

			// Enrich with video data
			const videoIds = [...new Set(signals.map((s) => s.videoId))];
			const videoMap = new Map<
				string,
				{ title: string; youtubeVideoId: string }
			>();
			if (videoIds.length > 0) {
				for (const vid of videoIds) {
					const [video] = await db
						.select({
							title: ytVideo.title,
							youtubeVideoId: ytVideo.youtubeVideoId,
						})
						.from(ytVideo)
						.where(eq(ytVideo.id, vid))
						.limit(1);
					if (video) {
						videoMap.set(vid, video);
					}
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

// ─── Combined YouTube Router ─────────────────────────────────────────────────

export const youtubeRouter = {
	feeds: feedRouter,
	videos: videoRouter,
	signals: signalRouter,
	clusters: clusterRouter,
	search: searchRouter,
};
