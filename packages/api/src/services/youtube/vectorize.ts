import { db } from "@my-app/db";
import { ytSignal } from "@my-app/db/schema/youtube";
import { eq } from "drizzle-orm";
import {
	type QueueProducer,
	type YtVectorizeQueueMessage,
	ytQueueKinds,
} from "../../contracts/youtube-queue";

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
/** text-embedding-3-small produces 1536-dimensional vectors */
export const EMBEDDING_DIMENSIONS = 1536;
/** Max tokens per embedding call is 8191 for text-embedding-3-small.
 *  We chunk signals into batches to stay under API limits (≈2000 chars/signal). */
const MAX_SIGNALS_PER_BATCH = 64;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface VectorizeIndexLike {
	upsert(
		vectors: Array<{
			id: string;
			values: number[];
			metadata?: Record<string, string | number | boolean>;
		}>
	): Promise<unknown>;
}

export interface EmbeddingProvider {
	generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export type ProcessYtVectorizeMessageResult =
	| "processed"
	| "no_unvectorized_signals"
	| "missing_vectorize_index";

export interface ProcessYtVectorizeMessageOptions {
	embeddingProvider?: EmbeddingProvider;
	message: YtVectorizeQueueMessage;
	vectorizeIndex?: VectorizeIndexLike;
	ytClusterQueue?: QueueProducer;
}

// ─── Embedding text builder ──────────────────────────────────────────────────

/**
 * Build a rich text for embedding that captures signal semantics for similarity search.
 * Keeps chunks big — full context window around the signal text.
 */
function buildEmbeddingText(signal: {
	type: string;
	severity: string;
	severityScore: number | null;
	text: string;
	component: string | null;
	tags: string[] | null;
	contextBefore: string | null;
	contextAfter: string | null;
	reasoning: string | null;
}): string {
	const parts: string[] = [];
	// Structured prefix for semantic meaning
	parts.push(`[${signal.type}/${signal.severity}]`);
	if (signal.component) {
		parts.push(`component:${signal.component}`);
	}
	if (signal.tags?.length) {
		parts.push(`tags:${signal.tags.join(",")}`);
	}
	if (signal.reasoning) {
		parts.push(`reason:${signal.reasoning}`);
	}
	// Full context window — keep chunks big for better embeddings
	if (signal.contextBefore) {
		parts.push(signal.contextBefore);
	}
	parts.push(signal.text);
	if (signal.contextAfter) {
		parts.push(signal.contextAfter);
	}
	return parts.join(" ").slice(0, 2000);
}

// ─── Metadata builder ────────────────────────────────────────────────────────

/**
 * Build rich metadata for Vectorize filtering.
 * Cloudflare Vectorize supports metadata filtering on string/number/boolean fields.
 */
function buildVectorMetadata(signal: {
	organizationId: string;
	videoId: string;
	transcriptId: string;
	type: string;
	severity: string;
	severityScore: number | null;
	component: string | null;
	confidence: number | null;
	clusterId: string | null;
}): Record<string, string | number | boolean> {
	const meta: Record<string, string | number | boolean> = {
		organizationId: signal.organizationId,
		videoId: signal.videoId,
		transcriptId: signal.transcriptId,
		type: signal.type,
		severity: signal.severity,
	};
	if (signal.severityScore !== null) {
		meta.severityScore = signal.severityScore;
	}
	if (signal.component) {
		meta.component = signal.component;
	}
	if (signal.confidence !== null) {
		meta.confidence = signal.confidence;
	}
	if (signal.clusterId) {
		meta.clusterId = signal.clusterId;
	}
	return meta;
}

// ─── Main processor ──────────────────────────────────────────────────────────

export const processYtVectorizeMessage = async ({
	message,
	vectorizeIndex,
	embeddingProvider,
	ytClusterQueue,
}: ProcessYtVectorizeMessageOptions): Promise<ProcessYtVectorizeMessageResult> => {
	const { transcriptId, organizationId } = message;

	const signals = await db
		.select()
		.from(ytSignal)
		.where(eq(ytSignal.transcriptId, transcriptId));

	const unvectorized = signals.filter((s) => !s.vectorized);
	if (unvectorized.length === 0) {
		console.log(
			`[yt-vectorize] No unvectorized signals for transcript ${transcriptId}`
		);
		return "no_unvectorized_signals";
	}

	if (!vectorizeIndex) {
		return "missing_vectorize_index";
	}

	console.log(
		`[yt-vectorize] Processing ${unvectorized.length} signals for transcript ${transcriptId}`
	);

	const modelName = embeddingProvider ? DEFAULT_EMBEDDING_MODEL : "hash-256";

	// Process in batches to respect API token limits
	for (let i = 0; i < unvectorized.length; i += MAX_SIGNALS_PER_BATCH) {
		const batch = unvectorized.slice(i, i + MAX_SIGNALS_PER_BATCH);
		const embeddingTexts = batch.map((s) => buildEmbeddingText(s));

		let embeddings: number[][];
		if (embeddingProvider) {
			embeddings = await embeddingProvider.generateEmbeddings(embeddingTexts);
		} else {
			embeddings = embeddingTexts.map((text) =>
				simpleHashEmbedding(text, EMBEDDING_DIMENSIONS)
			);
		}

		const vectors = batch.map((s, j) => ({
			id: s.id,
			values: embeddings[j] ?? [],
			metadata: buildVectorMetadata(s),
		}));

		await vectorizeIndex.upsert(vectors);

		for (const signal of batch) {
			await db
				.update(ytSignal)
				.set({
					vectorized: true,
					embeddingModel: modelName,
				})
				.where(eq(ytSignal.id, signal.id));
		}
	}

	// Pipeline: vectorize → cluster (dispatch after all vectors are upserted)
	if (ytClusterQueue) {
		for (const signal of unvectorized) {
			await ytClusterQueue.send(
				{
					kind: ytQueueKinds.cluster,
					signalId: signal.id,
					organizationId,
				},
				{ contentType: "json" }
			);
		}
	}

	return "processed";
};

// ─── Test fallback ───────────────────────────────────────────────────────────

/**
 * Deterministic hash-based pseudo-embedding for testing/local dev.
 * NOT suitable for real similarity — use a real embedding model in production.
 */
function simpleHashEmbedding(text: string, dimensions: number): number[] {
	const values = new Float64Array(dimensions);
	for (let i = 0; i < text.length; i++) {
		const idx = i % dimensions;
		values[idx] = (values[idx] ?? 0) + text.charCodeAt(i) * (i + 1);
	}
	// Normalize to unit vector
	let magnitude = 0;
	for (const v of values) {
		magnitude += v * v;
	}
	magnitude = Math.sqrt(magnitude);
	if (magnitude === 0) {
		return Array.from(values);
	}
	return Array.from(values, (v) => v / magnitude);
}
