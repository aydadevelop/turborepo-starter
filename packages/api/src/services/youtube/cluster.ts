import { db } from "@my-app/db";
import { ytCluster, ytSignal, ytVideo } from "@my-app/db/schema/youtube";
import { and, eq, sql } from "drizzle-orm";
import type { YtClusterQueueMessage } from "../../contracts/youtube-queue";

const SIMILARITY_THRESHOLD = 0.85;

interface VectorizeQueryResult {
	matches: { id: string; score: number }[];
}

export interface VectorizeIndex {
	query(
		vector: unknown,
		options?: Record<string, unknown>
	): Promise<VectorizeQueryResult>;
	queryById(
		vectorId: string,
		options?: Record<string, unknown>
	): Promise<VectorizeQueryResult>;
}

const clusterTitleFromSignal = (text: string): string => {
	const normalized = text.trim().replace(/\s+/g, " ");
	if (normalized.length <= 120) {
		return normalized;
	}
	return `${normalized.slice(0, 117)}...`;
};

/** Fallback severity label → score mapping when severityScore is not set. */
const severityLabelToScore = (severity: string): number => {
	switch (severity) {
		case "critical":
			return 10;
		case "high":
			return 8;
		case "medium":
			return 5;
		case "low":
			return 3;
		case "info":
			return 1;
		default:
			return 1;
	}
};

/** Simple semver comparison: true if a > b */
const isNewerVersion = (a: string, b: string): boolean => {
	const parse = (v: string) => v.split(".").map(Number);
	const pa = parse(a);
	const pb = parse(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const na = pa[i] ?? 0;
		const nb = pb[i] ?? 0;
		if (na > nb) {
			return true;
		}
		if (na < nb) {
			return false;
		}
	}
	return false;
};

const recalculateClusterStats = async (
	clusterId: string,
	currentSignalCount: number,
	currentUniqueAuthors: number,
	clusterSeverity: string
) => {
	const signalCount = currentSignalCount + 1;

	const [authorsResult] = await db
		.select({
			count: sql<number>`count(distinct ${ytVideo.channelId})`,
		})
		.from(ytSignal)
		.innerJoin(ytVideo, eq(ytSignal.videoId, ytVideo.id))
		.where(eq(ytSignal.clusterId, clusterId));
	const uniqueAuthors = Math.max(
		authorsResult?.count ?? 1,
		currentUniqueAuthors,
		1
	);

	// Use max severityScore from signals if available, fall back to label mapping
	const [scoreResult] = await db
		.select({
			maxScore: sql<number | null>`max(${ytSignal.severityScore})`,
		})
		.from(ytSignal)
		.where(eq(ytSignal.clusterId, clusterId));
	const bestScore =
		scoreResult?.maxScore ?? severityLabelToScore(clusterSeverity);

	const impactScore = signalCount * uniqueAuthors * bestScore;

	return { signalCount, uniqueAuthors, impactScore };
};

interface SignalInfo {
	gameVersion: string | null;
	id: string;
	organizationId: string;
	severity: string;
	severityScore: number | null;
	text: string;
	type: string;
}

/** Try to merge a signal into an existing cluster via vector similarity. Returns true if merged. */
const tryMergeIntoExistingCluster = async (
	signal: SignalInfo,
	vectorizeIndex: VectorizeIndex
): Promise<boolean> => {
	const results = await vectorizeIndex.queryById(signal.id, {
		topK: 5,
		filter: { organizationId: signal.organizationId },
	});
	const bestMatch = results.matches?.find(
		(m) => m.score >= SIMILARITY_THRESHOLD && m.id !== signal.id
	);
	if (!bestMatch) {
		return false;
	}

	const [matchedSignal] = await db
		.select({ clusterId: ytSignal.clusterId })
		.from(ytSignal)
		.where(eq(ytSignal.id, bestMatch.id))
		.limit(1);

	if (!matchedSignal?.clusterId) {
		return false;
	}

	// Assign this signal to the matched cluster
	await db
		.update(ytSignal)
		.set({ clusterId: matchedSignal.clusterId })
		.where(eq(ytSignal.id, signal.id));

	const [cluster] = await db
		.select()
		.from(ytCluster)
		.where(eq(ytCluster.id, matchedSignal.clusterId));

	if (!cluster) {
		return true;
	}

	const stats = await recalculateClusterStats(
		cluster.id,
		cluster.signalCount,
		cluster.uniqueAuthors,
		cluster.severity ?? "medium"
	);

	// Check for regression: fixed cluster + signal from newer version
	const isRegression =
		cluster.state === "fixed" &&
		cluster.fixedInVersion &&
		signal.gameVersion &&
		isNewerVersion(signal.gameVersion, cluster.fixedInVersion);

	await db
		.update(ytCluster)
		.set({
			signalCount: stats.signalCount,
			uniqueAuthors: stats.uniqueAuthors,
			impactScore: stats.impactScore,
			...(isRegression ? { state: "regression" } : {}),
		})
		.where(eq(ytCluster.id, cluster.id));

	return true;
};

export type ProcessYtClusterMessageResult =
	| "clustered"
	| "merged"
	| "already_clustered"
	| "not_found";

export interface ProcessYtClusterMessageOptions {
	message: YtClusterQueueMessage;
	vectorizeIndex?: VectorizeIndex;
}

export const processYtClusterMessage = async ({
	message,
	vectorizeIndex,
}: ProcessYtClusterMessageOptions): Promise<ProcessYtClusterMessageResult> => {
	const { signalId, organizationId } = message;

	const [signal] = await db
		.select({
			id: ytSignal.id,
			clusterId: ytSignal.clusterId,
			organizationId: ytSignal.organizationId,
			type: ytSignal.type,
			severity: ytSignal.severity,
			severityScore: ytSignal.severityScore,
			text: ytSignal.text,
			gameVersion: ytSignal.gameVersion,
		})
		.from(ytSignal)
		.where(
			and(
				eq(ytSignal.id, signalId),
				eq(ytSignal.organizationId, organizationId)
			)
		)
		.limit(1);

	if (!signal) {
		return "not_found";
	}

	// Idempotency: if already clustered, treat as success.
	if (signal.clusterId) {
		return "already_clustered";
	}

	// Try to merge into an existing cluster via similarity search
	if (vectorizeIndex) {
		const merged = await tryMergeIntoExistingCluster(signal, vectorizeIndex);
		if (merged) {
			return "merged";
		}
	}

	// No similar cluster found — create a new one
	const clusterId = crypto.randomUUID();

	await db.insert(ytCluster).values({
		id: clusterId,
		organizationId,
		title: clusterTitleFromSignal(signal.text),
		summary: null,
		type: signal.type,
		severity: signal.severity,
		signalCount: 1,
		impactScore: signal.severityScore ?? severityLabelToScore(signal.severity),
	});

	await db.update(ytSignal).set({ clusterId }).where(eq(ytSignal.id, signalId));

	return "clustered";
};
