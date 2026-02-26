import { db } from "@my-app/db";
import {
	ytCluster,
	ytSignal,
	ytSignalSeverityValues,
	ytSignalTypeValues,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { and, eq, isNull } from "drizzle-orm";
import type { QueueProducer, YtClusterQueueMessage } from "../../contracts/youtube-queue";
import type { VectorizeIndexLike } from "./vectorize";
import { emitYtNotification } from "./notify";

// ─── Tunable thresholds ──────────────────────────────────────────────────────
// These control the quality/granularity tradeoff of clustering.

/**
 * Minimum cosine similarity between a signal vector and a **cluster centroid**
 * to consider merging. Higher = tighter, more clusters.
 * 0.75 is reasonable for centroid matching (vs. 0.64 for single-linkage).
 */
const CENTROID_SIMILARITY_THRESHOLD = 0.65;

/**
 * Maximum cosine *distance* (1 - similarity) from centroid to any member.
 * If adding a signal would push the cluster beyond this radius, reject the merge.
 * Prevents cluster sprawl even when centroid similarity is above threshold.
 */
const MAX_CLUSTER_RADIUS = 0.4;

/** How many nearest centroid candidates to fetch from Vectorize. */
const CENTROID_TOP_K = 10;

/** Vectorize ID prefix for centroid vectors. */
const CENTROID_PREFIX = "centroid:";

// ─── Severity / helpers ──────────────────────────────────────────────────────

const signalTypeSet = new Set(ytSignalTypeValues);
const signalSeveritySet = new Set(ytSignalSeverityValues);

const severityWeight: Record<string, number> = {
	critical: 10,
	high: 8,
	medium: 5,
	low: 3,
	info: 1,
};

type DbExecutor = Pick<typeof db, "insert" | "select" | "update">;
type SignalType = (typeof ytSignalTypeValues)[number];
type SignalSeverity = (typeof ytSignalSeverityValues)[number];

/** Re-export so the consumer can keep using VectorizeIndex as a type name. */
export type VectorizeIndex = VectorizeIndexLike;

const clusterTitleFromSignal = (text: string): string => {
	const normalized = text.trim().replace(/\s+/g, " ");
	if (normalized.length <= 120) return normalized;
	return `${normalized.slice(0, 117)}...`;
};

const getSeverityWeight = (severity: string): number =>
	severityWeight[severity] ?? 1;

const compareSemverLike = (a: string, b: string): number => {
	const parse = (v: string) =>
		v.split(".").map((part) => Number.parseInt(part.match(/\d+/)?.[0] ?? "0", 10));
	const pa = parse(a);
	const pb = parse(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const da = pa[i] ?? 0;
		const db = pb[i] ?? 0;
		if (da !== db) return da > db ? 1 : -1;
	}
	return a.localeCompare(b);
};

const isNewerVersion = (a: string, b: string): boolean =>
	compareSemverLike(a, b) > 0;

const pickMode = (values: Array<string | null | undefined>): string | null => {
	const counts = new Map<string, { count: number; firstSeen: number; value: string }>();
	let index = 0;
	for (const raw of values) {
		const value = raw?.trim();
		if (!value) { index++; continue; }
		const key = value.toLowerCase();
		const entry = counts.get(key);
		if (entry) { entry.count += 1; }
		else { counts.set(key, { count: 1, firstSeen: index, value }); }
		index++;
	}
	let winner: { count: number; firstSeen: number; value: string } | null = null;
	for (const entry of counts.values()) {
		if (!winner || entry.count > winner.count ||
			(entry.count === winner.count && entry.firstSeen < winner.firstSeen))
			winner = entry;
	}
	return winner?.value ?? null;
};

// ─── Vector math ─────────────────────────────────────────────────────────────

/**
 * Compute the updated centroid after adding a new vector.
 * new_centroid = (old_centroid * n + new_vector) / (n + 1)
 * Then L2-normalize so cosine similarity stays meaningful.
 */
const updateCentroid = (
	oldCentroid: number[],
	memberCount: number,
	newVector: number[],
): number[] => {
	const dim = oldCentroid.length;
	const result = new Array<number>(dim);
	const n = memberCount;
	for (let i = 0; i < dim; i++) {
		result[i] = ((oldCentroid[i] ?? 0) * n + (newVector[i] ?? 0)) / (n + 1);
	}
	// L2 normalize
	let norm = 0;
	for (let i = 0; i < dim; i++) norm += (result[i] ?? 0) ** 2;
	norm = Math.sqrt(norm);
	if (norm > 1e-10) {
		for (let i = 0; i < dim; i++) result[i] = (result[i] ?? 0) / norm;
	}
	return result;
};

const toNumberArray = (
	v: number[] | Float32Array | Float64Array | undefined,
): number[] | null => {
	if (!v) return null;
	return Array.isArray(v) ? v : Array.from(v);
};

// ─── DB helpers ──────────────────────────────────────────────────────────────

interface SignalInfo {
	clusterId: string | null;
	component: string | null;
	gameVersion: string | null;
	id: string;
	organizationId: string;
	reasoning: string | null;
	severity: string;
	severityScore: number | null;
	text: string;
	type: string;
}

const getSignalById = async (
	database: DbExecutor,
	signalId: string,
	organizationId: string,
): Promise<SignalInfo | null> => {
	const [signal] = await database
		.select({
			id: ytSignal.id,
			clusterId: ytSignal.clusterId,
			organizationId: ytSignal.organizationId,
			type: ytSignal.type,
			severity: ytSignal.severity,
			severityScore: ytSignal.severityScore,
			text: ytSignal.text,
			component: ytSignal.component,
			gameVersion: ytSignal.gameVersion,
			reasoning: ytSignal.reasoning,
		})
		.from(ytSignal)
		.where(
			and(
				eq(ytSignal.id, signalId),
				eq(ytSignal.organizationId, organizationId),
			),
		)
		.limit(1);
	return signal ?? null;
};

const getClusterDerivedValues = async (
	database: DbExecutor,
	clusterId: string,
) => {
	const clusterSignals = await database
		.select({
			videoId: ytSignal.videoId,
			type: ytSignal.type,
			severity: ytSignal.severity,
			severityScore: ytSignal.severityScore,
			component: ytSignal.component,
			gameVersion: ytSignal.gameVersion,
			uploaderChannelId: ytVideo.uploaderChannelId,
		})
		.from(ytSignal)
		.leftJoin(ytVideo, eq(ytSignal.videoId, ytVideo.id))
		.where(eq(ytSignal.clusterId, clusterId));

	const signalCount = clusterSignals.length;
	if (signalCount === 0) {
		return {
			signalCount: 0,
			uniqueAuthors: 0,
			impactScore: 0,
			type: null,
			severity: null,
			component: null,
			firstSeenVersion: null,
			versionsAffected: null as string[] | null,
		};
	}

	const authorSet = new Set<string>();
	for (const signal of clusterSignals) {
		authorSet.add(signal.uploaderChannelId ?? `video:${signal.videoId}`);
	}
	const uniqueAuthors = authorSet.size;

	const dominantTypeRaw = pickMode(clusterSignals.map((s) => s.type));
	const dominantType =
		dominantTypeRaw && signalTypeSet.has(dominantTypeRaw as SignalType)
			? (dominantTypeRaw as SignalType)
			: null;
	const dominantComponent = pickMode(clusterSignals.map((s) => s.component));

	let topSeverity: SignalSeverity = "info";
	let topWeight = 0;
	for (const signal of clusterSignals) {
		const w = severityWeight[signal.severity] ?? 0;
		if (w > topWeight) {
			topWeight = w;
			if (signalSeveritySet.has(signal.severity as SignalSeverity)) {
				topSeverity = signal.severity as SignalSeverity;
			}
		}
	}

	let bestScore: number | null = null;
	for (const signal of clusterSignals) {
		if (typeof signal.severityScore === "number" &&
			(bestScore === null || signal.severityScore > bestScore))
			bestScore = signal.severityScore;
	}
	const weight = bestScore ?? getSeverityWeight(topSeverity);
	const impactScore = signalCount * uniqueAuthors * weight;

	const versionsAffected = [
		...new Set(
			clusterSignals
				.map((s) => s.gameVersion?.trim() ?? "")
				.filter((v) => v.length > 0),
		),
	].sort(compareSemverLike);

	return {
		signalCount,
		uniqueAuthors,
		impactScore,
		type: dominantType,
		severity: topSeverity,
		component: dominantComponent,
		firstSeenVersion: versionsAffected[0] ?? null,
		versionsAffected: versionsAffected.length > 0 ? versionsAffected : null,
	};
};

// ─── Centroid-based similarity matching ──────────────────────────────────────

interface CentroidMatch {
	clusterId: string;
	score: number;
	centroidVector: number[];
}

/**
 * Find the best cluster centroid match for a signal vector.
 *
 * Flow:
 *   1. query() Vectorize with the signal's actual vector to find nearest centroids
 *   2. Filter: similarity ≥ threshold
 *   3. Compactness gate: estimate new radius if this signal were added
 *   4. Return the best match (or null)
 */
const findBestCentroidMatch = async (
	signalVector: number[],
	organizationId: string,
	validClusterIds: Set<string>,
	vectorizeIndex: VectorizeIndexLike,
): Promise<CentroidMatch | null> => {
	// Query Vectorize for nearest centroid vectors
	const results = await vectorizeIndex.query(signalVector, {
		topK: CENTROID_TOP_K,
		filter: { kind: "centroid", organizationId },
	});

	const matches = results.matches ?? [];
	console.debug(
		`[yt-cluster] Vectorize query → ${matches.length} centroid(s) returned, ${validClusterIds.size} valid cluster IDs in DB`,
	);
	if (matches.length > 0) {
		console.debug(
			`[yt-cluster] Top scores: ${matches.slice(0, 5).map((m) => `${m.id.slice(-8)}=${m.score.toFixed(4)}`).join(", ")}`,
		);
	}

	const aboveThreshold = matches.filter(
		(m) => m.score >= CENTROID_SIMILARITY_THRESHOLD,
	);
	console.debug(
		`[yt-cluster] Above threshold ${CENTROID_SIMILARITY_THRESHOLD}: ${aboveThreshold.length}`,
	);
	if (aboveThreshold.length === 0) return null;

	// Fetch centroid vectors for compactness check
	const centroidIds = aboveThreshold.map((m) => m.id);
	const centroidVectors = await vectorizeIndex.getByIds(centroidIds);
	const vectorById = new Map(
		centroidVectors
			.filter((v) => v.values)
			.map((v) => [v.id, toNumberArray(v.values)!]),
	);

	let best: CentroidMatch | null = null;
	let staleCount = 0;

	for (const match of aboveThreshold) {
		const centroidVec = vectorById.get(match.id);
		if (!centroidVec) continue;

		const clusterId = match.id.slice(CENTROID_PREFIX.length);
		if (!validClusterIds.has(clusterId)) {
			staleCount++;
			continue;
		}

		// Compactness gate: estimate radius after adding this signal.
		// Distance from signal to centroid is (1 - similarity).
		// If this distance exceeds MAX_CLUSTER_RADIUS, skip.
		const distFromCentroid = 1 - match.score;
		if (distFromCentroid > MAX_CLUSTER_RADIUS) continue;

		if (!best || match.score > best.score) {
			best = { clusterId, score: match.score, centroidVector: centroidVec };
		}
	}

	if (staleCount > 0) {
		console.warn(
			`[yt-cluster] Skipped ${staleCount} stale centroid(s) (cluster deleted from DB but vector still in Vectorize). Run recreate to purge.`,
		);
	}
	console.debug(`[yt-cluster] Best match: ${best ? `clusterId=${best.clusterId} score=${best.score.toFixed(4)}` : "none"}`);

	return best;
};

/**
 * Upsert a centroid vector into Vectorize.
 */
const upsertCentroid = async (
	vectorizeIndex: VectorizeIndexLike,
	clusterId: string,
	organizationId: string,
	centroidVector: number[],
): Promise<void> => {
	await vectorizeIndex.upsert([{
		id: `${CENTROID_PREFIX}${clusterId}`,
		values: centroidVector,
		metadata: { kind: "centroid", organizationId },
	}]);
};

// ─── Merge + cluster creation ────────────────────────────────────────────────

const mergeSignalIntoCluster = async (
	database: DbExecutor,
	signal: SignalInfo,
	clusterId: string,
) => {
	await database
		.update(ytSignal)
		.set({ clusterId })
		.where(and(eq(ytSignal.id, signal.id), isNull(ytSignal.clusterId)));

	const [cluster] = await database
		.select()
		.from(ytCluster)
		.where(eq(ytCluster.id, clusterId))
		.limit(1);

	if (!cluster) return;

	const derived = await getClusterDerivedValues(database, cluster.id);

	const isRegression =
		cluster.state === "fixed" &&
		cluster.fixedInVersion &&
		signal.gameVersion &&
		isNewerVersion(signal.gameVersion, cluster.fixedInVersion);

	await database
		.update(ytCluster)
		.set({
			signalCount: derived.signalCount,
			uniqueAuthors: derived.uniqueAuthors,
			impactScore: derived.impactScore,
			type: derived.type,
			severity: derived.severity,
			component: derived.component,
			firstSeenVersion: derived.firstSeenVersion,
			versionsAffected: derived.versionsAffected,
			...(isRegression ? { state: "regression" as const } : {}),
		})
		.where(eq(ytCluster.id, cluster.id));
};

// ─── Main clustering flow ────────────────────────────────────────────────────

export type ProcessYtClusterMessageResult =
	| "clustered"
	| "merged"
	| "already_clustered"
	| "not_found";

export interface ProcessYtClusterMessageOptions {
	message: YtClusterQueueMessage;
	vectorizeIndex?: VectorizeIndexLike;
	notificationQueue?: QueueProducer;
}

/**
 * Process a single signal for clustering.
 *
 * Algorithm (centroid-based, no fingerprint priority):
 *   1. Retrieve the signal's embedding vector from Vectorize
 *   2. Query Vectorize for nearest cluster centroids (metadata kind=centroid)
 *   3. Pick best centroid above CENTROID_SIMILARITY_THRESHOLD with compactness gate
 *   4. If match found → merge signal, update centroid incrementally
 *   5. If no match → create new cluster, insert centroid = signal vector
 */
export const processYtClusterMessage = async ({
	message,
	vectorizeIndex,
	notificationQueue,
}: ProcessYtClusterMessageOptions): Promise<ProcessYtClusterMessageResult> => {
	const { signalId, organizationId } = message;

	const signal = await getSignalById(db, signalId, organizationId);
	if (!signal) return "not_found";
	if (signal.clusterId) return "already_clustered";

	// ── Step 1: Get signal's embedding vector ────────────────────────────
	if (!vectorizeIndex) {
		// No Vectorize → can't cluster. Create singleton.
		return createSingletonCluster(db, signal, null, notificationQueue);
	}

	const signalVectors = await vectorizeIndex.getByIds([signalId]);
	const signalVector = toNumberArray(signalVectors[0]?.values);

	if (!signalVector) {
		// Signal hasn't been vectorized yet — create singleton as fallback
		return createSingletonCluster(db, signal, null, notificationQueue);
	}

	// ── Step 2: Load cluster signal counts for centroid update math ──────
	const orgClusters = await db
		.select({ id: ytCluster.id, signalCount: ytCluster.signalCount })
		.from(ytCluster)
		.where(eq(ytCluster.organizationId, organizationId));
	const clusterSignalCounts = new Map(orgClusters.map((c) => [c.id, c.signalCount]));
	const validClusterIds = new Set(orgClusters.map((c) => c.id));

	// ── Step 3: Find best centroid match ─────────────────────────────────
	const match = await findBestCentroidMatch(
		signalVector,
		organizationId,
		validClusterIds,
		vectorizeIndex,
	);

	if (match) {
		// ── Step 4: Merge into existing cluster, update centroid ─────────
		await mergeSignalIntoCluster(db, signal, match.clusterId);

		const memberCount = clusterSignalCounts.get(match.clusterId) ?? 1;
		const newCentroid = updateCentroid(match.centroidVector, memberCount, signalVector);
		await upsertCentroid(vectorizeIndex, match.clusterId, organizationId, newCentroid);

		return "merged";
	}

	// ── Step 5: No match — create new cluster + centroid ────────────────
	return createSingletonCluster(db, signal, { signalVector, vectorizeIndex }, notificationQueue);
};

interface VectorInfo {
	signalVector: number[];
	vectorizeIndex: VectorizeIndexLike;
}

const createSingletonCluster = async (
	database: DbExecutor,
	signal: SignalInfo,
	vectorInfo: VectorInfo | null,
	notificationQueue?: QueueProducer,
): Promise<"clustered"> => {
	const clusterId = crypto.randomUUID();

	await database.insert(ytCluster).values({
		id: clusterId,
		organizationId: signal.organizationId,
		title: clusterTitleFromSignal(signal.text),
		summary: signal.reasoning ?? null,
		type: signal.type as SignalType,
		severity: signal.severity as SignalSeverity,
		signalCount: 1,
		impactScore: signal.severityScore ?? getSeverityWeight(signal.severity),
		component: signal.component,
		firstSeenVersion: signal.gameVersion,
		versionsAffected: signal.gameVersion ? [signal.gameVersion] : null,
	});

	await database
		.update(ytSignal)
		.set({ clusterId })
		.where(and(eq(ytSignal.id, signal.id), isNull(ytSignal.clusterId)));

	const derived = await getClusterDerivedValues(database, clusterId);
	await database
		.update(ytCluster)
		.set({
			signalCount: derived.signalCount,
			uniqueAuthors: derived.uniqueAuthors,
			impactScore: derived.impactScore,
			type: derived.type,
			severity: derived.severity,
			component: derived.component,
			firstSeenVersion: derived.firstSeenVersion,
			versionsAffected: derived.versionsAffected,
		})
		.where(eq(ytCluster.id, clusterId));

	// Insert centroid into Vectorize (centroid of a single signal = signal vector)
	if (vectorInfo) {
		await upsertCentroid(
			vectorInfo.vectorizeIndex,
			clusterId,
			signal.organizationId,
			vectorInfo.signalVector,
		);
	}

	// Notify
	let clusterSeverity: "info" | "warning" | "error" = "info";
	if (signal.severity === "critical") clusterSeverity = "error";
	else if (signal.severity === "high") clusterSeverity = "warning";

	await emitYtNotification({
		organizationId: signal.organizationId,
		eventType: "youtube.cluster.created",
		idempotencyKey: `yt-cluster:${clusterId}`,
		title: `New insight cluster: ${clusterTitleFromSignal(signal.text)}`,
		ctaUrl: "/youtube/insights",
		severity: clusterSeverity,
		notificationQueue,
	});

	return "clustered";
};
