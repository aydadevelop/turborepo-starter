import { db } from "@my-app/db";
import { ytFeed, ytSignal, ytVideo } from "@my-app/db/schema/youtube";
import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import {
	type QueueProducer,
	ytQueueKinds,
} from "../../contracts/youtube-queue";

// ─── Failure classification ───────────────────────────────────────────────────

/**
 * Patterns in failureReason that indicate a transient issue worth retrying.
 * All matches are case-insensitive against the full stored error string.
 */
const TRANSIENT_PATTERNS = [
	/LOGIN_REQUIRED/,
	/Timed out after/,
	/TimeoutError/,
	/HTTP 429/,
	/HTTP 5\d\d/,
	/proxy/i,
];

/**
 * Patterns that are definitively permanent — no point retrying automatically.
 * A failure is permanent only when EVERY client result matches one of these.
 */
const PERMANENT_PATTERNS = [
	/playabilityStatus=ERROR.*unavailable/i,
	/playabilityStatus=ERROR.*removed/i,
	/playabilityStatus=ERROR.*private/i,
	/playabilityStatus=UNPLAYABLE/,
];

/**
 * Returns true if the stored failureReason looks like a transient issue that
 * is worth re-queuing automatically (proxy timeout, bot-detection, rate-limit).
 */
export function isTransientFailure(failureReason: string | null): boolean {
	if (!failureReason) {
		return false;
	}
	if (PERMANENT_PATTERNS.some((re) => re.test(failureReason))) {
		return false;
	}
	return TRANSIENT_PATTERNS.some((re) => re.test(failureReason));
}

// ─── Stuck-ingesting recovery ─────────────────────────────────────────────────

export interface RecoverStuckIngestingOptions {
	/** How old a video must be in "ingesting" status before it is re-queued (default: 15 min) */
	stuckThresholdMs?: number;
	ytIngestQueue: QueueProducer;
}

/**
 * Finds videos stuck in "ingesting" status (worker crash / deployment interrupted
 * processing without re-delivering the queue message) and re-queues them.
 *
 * Safe to run concurrently with normal processing — the ingest handler is
 * idempotent: it re-sets status to "ingesting" and processes from scratch.
 *
 * Returns the number of videos re-queued.
 */
export async function recoverStuckIngesting({
	ytIngestQueue,
	stuckThresholdMs = 15 * 60 * 1000,
}: RecoverStuckIngestingOptions): Promise<number> {
	const cutoff = new Date(Date.now() - stuckThresholdMs);

	const stuck = await db
		.select({
			id: ytVideo.id,
			organizationId: ytVideo.organizationId,
			youtubeVideoId: ytVideo.youtubeVideoId,
			enableAsr: ytFeed.enableAsr,
		})
		.from(ytVideo)
		.leftJoin(ytFeed, eq(ytVideo.feedId, ytFeed.id))
		.where(and(eq(ytVideo.status, "ingesting"), lt(ytVideo.updatedAt, cutoff)))
		.limit(50);

	if (stuck.length === 0) {
		return 0;
	}

	console.log(
		`[yt-recovery] Found ${stuck.length} video(s) stuck in "ingesting" since before ${cutoff.toISOString()}, re-queuing...`
	);

	let requeued = 0;
	for (const video of stuck) {
		try {
			await ytIngestQueue.send(
				{
					kind: ytQueueKinds.ingest,
					videoId: video.id,
					organizationId: video.organizationId,
					youtubeVideoId: video.youtubeVideoId,
					forceAsr: false,
					enableAsr: video.enableAsr ?? false,
				},
				{ contentType: "json" }
			);
			requeued++;
			console.log(
				`[yt-recovery] Re-queued video ${video.youtubeVideoId} (id: ${video.id})`
			);
		} catch (err) {
			console.error(`[yt-recovery] Failed to re-queue video ${video.id}:`, err);
		}
	}

	console.log(
		`[yt-recovery] Re-queued ${requeued}/${stuck.length} stuck video(s)`
	);
	return requeued;
}

// ─── Failed-video transient recovery ─────────────────────────────────────────

export interface RecoverTransientFailuresOptions {
	/**
	 * Upper bound — don't retry videos that failed very long ago, they're
	 * likely permanently broken. (default: 48 h)
	 */
	maxAgeMs?: number;
	/**
	 * Only recover videos that have been in "failed" status for at least this
	 * long — avoids immediately re-queuing brand-new failures. (default: 5 min)
	 */
	minAgeMs?: number;
	ytIngestQueue: QueueProducer;
}

/**
 * Scans videos in "failed" status whose failureReason matches a known transient
 * pattern (proxy timeout, LOGIN_REQUIRED, rate-limit, server error) and
 * re-queues them for another ingest attempt.
 *
 * Permanent failures (video removed/private/unavailable) are left untouched.
 *
 * Returns `{ requeued, skipped }` counts.
 */
export async function recoverTransientFailures({
	ytIngestQueue,
	minAgeMs = 5 * 60 * 1000,
	maxAgeMs = 48 * 60 * 60 * 1000,
}: RecoverTransientFailuresOptions): Promise<{
	requeued: number;
	skipped: number;
}> {
	const minCutoff = new Date(Date.now() - maxAgeMs); // older than maxAge → skip
	const maxCutoff = new Date(Date.now() - minAgeMs); // newer than minAge → skip

	const candidates = await db
		.select({
			id: ytVideo.id,
			organizationId: ytVideo.organizationId,
			youtubeVideoId: ytVideo.youtubeVideoId,
			feedId: ytVideo.feedId,
			failureReason: ytVideo.failureReason,
			enableAsr: ytFeed.enableAsr,
		})
		.from(ytVideo)
		.leftJoin(ytFeed, eq(ytVideo.feedId, ytFeed.id))
		.where(
			and(
				eq(ytVideo.status, "failed"),
				isNotNull(ytVideo.failureReason),
				gt(ytVideo.updatedAt, minCutoff),
				lt(ytVideo.updatedAt, maxCutoff)
			)
		)
		.limit(50);

	if (candidates.length === 0) {
		return { requeued: 0, skipped: 0 };
	}

	console.log(
		`[yt-recovery] Checking ${candidates.length} failed video(s) for transient failures...`
	);

	let requeued = 0;
	let skipped = 0;

	for (const video of candidates) {
		if (!isTransientFailure(video.failureReason)) {
			skipped++;
			continue;
		}

		try {
			// Reset to "approved" so the ingest handler processes it normally
			await db
				.update(ytVideo)
				.set({ status: "approved", failureReason: null, failedStage: null })
				.where(eq(ytVideo.id, video.id));

			await ytIngestQueue.send(
				{
					kind: ytQueueKinds.ingest,
					videoId: video.id,
					organizationId: video.organizationId,
					youtubeVideoId: video.youtubeVideoId,
					forceAsr: false,
					enableAsr: video.enableAsr ?? false,
				},
				{ contentType: "json" }
			);

			requeued++;
			console.log(
				`[yt-recovery] Re-queued transient-failed video ${video.youtubeVideoId} (id: ${video.id}): ${video.failureReason?.slice(0, 120)}`
			);
		} catch (err) {
			console.error(`[yt-recovery] Failed to re-queue video ${video.id}:`, err);
		}
	}

	console.log(
		`[yt-recovery] Transient recovery: ${requeued} re-queued, ${skipped} skipped (permanent/unknown)`
	);
	return { requeued, skipped };
}

// ─── Missing-queue recovery (approved + unclustered) ───────────────────────

export interface RecoverMissingPipelineJobsOptions {
	/** Minimum age in milliseconds before a row is considered for re-queueing. */
	minAgeMs?: number;
	/** Maximum approved videos to re-queue per call (default: 200). */
	videoLimit?: number;
	/** Maximum unclustered signals to re-queue per call (default: 500). */
	signalLimit?: number;
	ytClusterQueue: QueueProducer;
	ytIngestQueue: QueueProducer;
}

/**
 * Recovers jobs that can be lost during local rebuilds/restarts:
 * - videos still in "approved" status (ingest message likely never consumed)
 * - signals that are vectorized but still unclustered (cluster message likely lost)
 */
export async function recoverMissingPipelineJobs({
	ytClusterQueue,
	ytIngestQueue,
	minAgeMs = 0,
	videoLimit = 200,
	signalLimit = 500,
}: RecoverMissingPipelineJobsOptions): Promise<{
	clusterRequeued: number;
	ingestRequeued: number;
}> {
	const cutoff = new Date(Date.now() - minAgeMs);

	const [approvedVideos, unclusteredSignals] = await Promise.all([
		db
			.select({
				id: ytVideo.id,
				organizationId: ytVideo.organizationId,
				youtubeVideoId: ytVideo.youtubeVideoId,
				enableAsr: ytFeed.enableAsr,
			})
			.from(ytVideo)
			.leftJoin(ytFeed, eq(ytVideo.feedId, ytFeed.id))
			.where(and(eq(ytVideo.status, "approved"), lt(ytVideo.updatedAt, cutoff)))
			.limit(videoLimit),
		db
			.select({
				id: ytSignal.id,
				organizationId: ytSignal.organizationId,
			})
			.from(ytSignal)
			.where(
				and(
					eq(ytSignal.vectorized, true),
					isNull(ytSignal.clusterId),
					lt(ytSignal.updatedAt, cutoff)
				)
			)
			.limit(signalLimit),
	]);

	let ingestRequeued = 0;
	for (const video of approvedVideos) {
		try {
			await ytIngestQueue.send(
				{
					kind: ytQueueKinds.ingest,
					videoId: video.id,
					organizationId: video.organizationId,
					youtubeVideoId: video.youtubeVideoId,
					forceAsr: false,
					enableAsr: video.enableAsr ?? false,
				},
				{ contentType: "json" }
			);
			ingestRequeued++;
		} catch (err) {
			console.error(
				`[yt-recovery] Failed to re-queue approved video ${video.id}:`,
				err
			);
		}
	}

	let clusterRequeued = 0;
	for (const signal of unclusteredSignals) {
		try {
			await ytClusterQueue.send(
				{
					kind: ytQueueKinds.cluster,
					signalId: signal.id,
					organizationId: signal.organizationId,
				},
				{ contentType: "json" }
			);
			clusterRequeued++;
		} catch (err) {
			console.error(
				`[yt-recovery] Failed to re-queue cluster signal ${signal.id}:`,
				err
			);
		}
	}

	console.log(
		`[yt-recovery] Missing-jobs recovery: ingest ${ingestRequeued}/${approvedVideos.length}, cluster ${clusterRequeued}/${unclusteredSignals.length}`
	);

	return { ingestRequeued, clusterRequeued };
}
