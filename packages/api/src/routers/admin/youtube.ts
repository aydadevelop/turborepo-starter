import { db } from "@my-app/db";
import { ytFeed, ytVideo } from "@my-app/db/schema/youtube";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, lt } from "drizzle-orm";
import z from "zod";
import { ytQueueKinds } from "../../contracts/youtube-queue";
import {
	isTransientFailure,
	recoverStuckIngesting,
	recoverTransientFailures,
} from "../../services/youtube/recovery";
import { adminProcedure } from "../shared/admin";
import { paginatedOutput, paginationInput } from "./shared";

// ─── Output schemas ───────────────────────────────────────────────────────────

const pipelineStatsSchema = z.object({
	candidate: z.number(),
	approved: z.number(),
	ingesting: z.number(),
	ingested: z.number(),
	failed: z.number(),
	rejected: z.number(),
	total: z.number(),
});

const stuckVideoSchema = z.object({
	id: z.string(),
	youtubeVideoId: z.string(),
	organizationId: z.string(),
	title: z.string(),
	updatedAt: z.string(),
	/** How long the video has been stuck, in milliseconds */
	stuckForMs: z.number(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const adminYoutubeRouter = {
	/**
	 * Pipeline health: video counts grouped by status, across all organisations.
	 */
	pipelineStats: adminProcedure
		.route({
			tags: ["Admin / YouTube"],
			summary: "Pipeline health — video counts by status",
		})
		.output(pipelineStatsSchema)
		.handler(async () => {
			const rows = await db
				.select({ status: ytVideo.status, n: count() })
				.from(ytVideo)
				.groupBy(ytVideo.status);

			const stats = {
				candidate: 0,
				approved: 0,
				ingesting: 0,
				ingested: 0,
				failed: 0,
				rejected: 0,
				total: 0,
			};

			for (const row of rows) {
				if (row.status in stats) {
					stats[row.status as keyof typeof stats] = row.n;
				}
				stats.total += row.n;
			}

			return stats;
		}),

	/**
	 * List videos currently stuck in "ingesting" status across all orgs.
	 * Use minAgeMinutes=0 (default) to see everything still in-flight,
	 * or e.g. 15 to only list videos reliably stuck.
	 */
	listStuck: adminProcedure
		.route({
			tags: ["Admin / YouTube"],
			summary: "List videos stuck in 'ingesting'",
		})
		.input(
			paginationInput.extend({
				minAgeMinutes: z.number().int().min(0).default(0),
			})
		)
		.output(paginatedOutput(stuckVideoSchema))
		.handler(async ({ input }) => {
			const cutoff = new Date(Date.now() - input.minAgeMinutes * 60 * 1000);
			const where = and(
				eq(ytVideo.status, "ingesting"),
				lt(ytVideo.updatedAt, cutoff)
			);

			const [items, countRows] = await Promise.all([
				db
					.select({
						id: ytVideo.id,
						youtubeVideoId: ytVideo.youtubeVideoId,
						organizationId: ytVideo.organizationId,
						title: ytVideo.title,
						updatedAt: ytVideo.updatedAt,
					})
					.from(ytVideo)
					.where(where)
					.orderBy(ytVideo.updatedAt)
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(ytVideo).where(where),
			]);

			const now = Date.now();
			return {
				items: items.map((v) => ({
					id: v.id,
					youtubeVideoId: v.youtubeVideoId,
					organizationId: v.organizationId,
					title: v.title,
					updatedAt: v.updatedAt.toISOString(),
					stuckForMs: now - v.updatedAt.getTime(),
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	/**
	 * Re-queue all videos stuck in "ingesting" across all orgs.
	 * minAgeMinutes=0 (default) recovers everything currently in-flight —
	 * useful immediately after a deployment that interrupted processing.
	 */
	recoverStuck: adminProcedure
		.route({
			tags: ["Admin / YouTube"],
			summary: "Re-queue videos stuck in 'ingesting' (admin-wide)",
		})
		.input(
			z.object({
				minAgeMinutes: z.number().int().min(0).max(120).optional().default(0),
			})
		)
		.output(z.object({ requeued: z.number() }))
		.handler(async ({ context, input }) => {
			if (!context.ytIngestQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "YT_INGEST_QUEUE is not bound to this worker",
				});
			}
			const requeued = await recoverStuckIngesting({
				ytIngestQueue: context.ytIngestQueue,
				stuckThresholdMs: input.minAgeMinutes * 60 * 1000,
			});
			return { requeued };
		}),

	/**
	 * Re-queue failed videos whose failure reason matches a transient pattern
	 * (proxy timeout, LOGIN_REQUIRED, rate-limit, server error).
	 * Permanent failures (removed/private/unavailable) are left untouched.
	 */
	recoverFailed: adminProcedure
		.route({
			tags: ["Admin / YouTube"],
			summary: "Re-queue transiently-failed videos (proxy / bot-detection)",
		})
		.input(
			z.object({
				/** Only recover videos that failed at least this many minutes ago (default: 5) */
				minAgeMinutes: z.number().int().min(0).max(60).optional().default(5),
			})
		)
		.output(z.object({ requeued: z.number(), skipped: z.number() }))
		.handler(async ({ context, input }) => {
			if (!context.ytIngestQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "YT_INGEST_QUEUE is not bound to this worker",
				});
			}
			return await recoverTransientFailures({
				ytIngestQueue: context.ytIngestQueue,
				minAgeMs: input.minAgeMinutes * 60 * 1000,
			});
		}),

	/**
	 * List failed videos classified by whether they are transient or permanent.
	 * Useful for auditing what can be auto-recovered vs what needs investigation.
	 */
	listFailed: adminProcedure
		.route({
			tags: ["Admin / YouTube"],
			summary: "List failed videos with transient/permanent classification",
		})
		.input(paginationInput)
		.output(
			paginatedOutput(
				z.object({
					id: z.string(),
					youtubeVideoId: z.string(),
					organizationId: z.string(),
					title: z.string(),
					failureReason: z.string().nullable(),
					failedStage: z.string().nullable(),
					updatedAt: z.string(),
					isTransient: z.boolean(),
				})
			)
		)
		.handler(async ({ input }) => {
			const where = eq(ytVideo.status, "failed");
			const [items, countRows] = await Promise.all([
				db
					.select({
						id: ytVideo.id,
						youtubeVideoId: ytVideo.youtubeVideoId,
						organizationId: ytVideo.organizationId,
						title: ytVideo.title,
						failureReason: ytVideo.failureReason,
						failedStage: ytVideo.failedStage,
						updatedAt: ytVideo.updatedAt,
					})
					.from(ytVideo)
					.where(where)
					.orderBy(desc(ytVideo.updatedAt))
					.limit(input.limit)
					.offset(input.offset),
				db.select({ value: count() }).from(ytVideo).where(where),
			]);
			return {
				items: items.map((v) => ({
					id: v.id,
					youtubeVideoId: v.youtubeVideoId,
					organizationId: v.organizationId,
					title: v.title,
					failureReason: v.failureReason ?? null,
					failedStage: v.failedStage ?? null,
					updatedAt: v.updatedAt.toISOString(),
					isTransient: isTransientFailure(v.failureReason),
				})),
				total: countRows[0]?.value ?? 0,
			};
		}),

	/**
	 * Force-retry any single video regardless of its current status or org.
	 * Resets status to "approved" and sends it to the ingest queue.
	 */
	retryVideo: adminProcedure
		.route({
			tags: ["Admin / YouTube"],
			summary: "Force-retry a video (admin, any org)",
		})
		.input(z.object({ videoId: z.string().trim().min(1) }))
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			const [video] = await db
				.select({
					id: ytVideo.id,
					organizationId: ytVideo.organizationId,
					youtubeVideoId: ytVideo.youtubeVideoId,
					feedId: ytVideo.feedId,
				})
				.from(ytVideo)
				.where(eq(ytVideo.id, input.videoId))
				.limit(1);

			if (!video) {
				throw new ORPCError("NOT_FOUND", { message: "Video not found" });
			}

			await db
				.update(ytVideo)
				.set({ status: "approved", failureReason: null, failedStage: null })
				.where(eq(ytVideo.id, video.id));

			if (!context.ytIngestQueue) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "YT_INGEST_QUEUE is not bound to this worker",
				});
			}

			const [feed] = await db
				.select({ enableAsr: ytFeed.enableAsr })
				.from(ytFeed)
				.where(eq(ytFeed.id, video.feedId))
				.limit(1);

			await context.ytIngestQueue.send(
				{
					kind: ytQueueKinds.ingest,
					videoId: video.id,
					organizationId: video.organizationId,
					youtubeVideoId: video.youtubeVideoId,
					enableAsr: feed?.enableAsr ?? false,
				},
				{ contentType: "json" }
			);

			return { success: true };
		}),
};
