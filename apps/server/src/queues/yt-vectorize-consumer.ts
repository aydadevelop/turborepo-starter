import { ytVectorizeQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytSignal } from "@my-app/db/schema/youtube";
import { eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 3;

interface VectorizeIndexLike {
	upsert(
		vectors: Array<{
			id: string;
			values: number[];
			metadata?: Record<string, string | number | boolean>;
		}>
	): Promise<unknown>;
}

const handleVectorizeMessage = async (
	queueMessage: Message,
	vectorizeIndex?: VectorizeIndexLike
) => {
	const parsed = ytVectorizeQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-vectorize] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const {
		transcriptId,
		videoId: _videoId,
		organizationId: _orgId,
	} = parsed.data;

	try {
		// 1. Load signals that haven't been vectorized yet
		const signals = await db
			.select()
			.from(ytSignal)
			.where(eq(ytSignal.transcriptId, transcriptId));

		const unvectorized = signals.filter((s) => !s.vectorized);
		if (unvectorized.length === 0) {
			console.log(
				`[yt-vectorize] No unvectorized signals for transcript ${transcriptId}`
			);
			queueMessage.ack();
			return;
		}

		// 2. Generate embeddings via OpenRouter/OpenAI
		// NOTE: In production, call the embeddings API here.
		// For now, this is a placeholder that marks signals as vectorized.
		console.log(
			`[yt-vectorize] Processing ${unvectorized.length} signals for transcript ${transcriptId}`
		);

		// 3. Upsert vectors into Vectorize index
		if (vectorizeIndex) {
			// Placeholder: real implementation generates embeddings first
			// const vectors = unvectorized.map((s) => ({
			//   id: s.id,
			//   values: embeddingsMap.get(s.id)!,
			//   metadata: {
			//     organizationId,
			//     videoId,
			//     type: s.type,
			//     severity: s.severity,
			//   },
			// }));
			// await vectorizeIndex.upsert(vectors);
		}

		// 4. Mark signals as vectorized
		for (const signal of unvectorized) {
			await db
				.update(ytSignal)
				.set({ vectorized: true, embeddingModel: "text-embedding-3-small" })
				.where(eq(ytSignal.id, signal.id));
		}

		queueMessage.ack();
	} catch (error) {
		console.error(
			`[yt-vectorize] Failed to vectorize transcript ${transcriptId}:`,
			error
		);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 30, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtVectorizeBatch = async (
	batch: MessageBatch<unknown>,
	vectorizeIndex?: VectorizeIndexLike
) => {
	for (const queueMessage of batch.messages) {
		await handleVectorizeMessage(queueMessage, vectorizeIndex);
	}
};
