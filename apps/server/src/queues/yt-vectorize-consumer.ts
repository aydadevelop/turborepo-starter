import {
	type QueueProducer,
	ytVectorizeQueueMessageSchema,
} from "@my-app/api/contracts/youtube-queue";
import {
	type EmbeddingProvider,
	processYtVectorizeMessage,
	type VectorizeIndexLike,
} from "@my-app/api/services/youtube/vectorize";

const MAX_RETRY_ATTEMPTS = 3;

export interface YtVectorizeDependencies {
	embeddingProvider?: EmbeddingProvider;
	vectorizeIndex?: VectorizeIndexLike;
	ytClusterQueue?: QueueProducer;
}

const handleVectorizeMessage = async (
	queueMessage: Message,
	deps: YtVectorizeDependencies
) => {
	const parsed = ytVectorizeQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-vectorize] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { transcriptId } = parsed.data;

	try {
		const result = await processYtVectorizeMessage({
			message: parsed.data,
			vectorizeIndex: deps.vectorizeIndex,
			embeddingProvider: deps.embeddingProvider,
			ytClusterQueue: deps.ytClusterQueue,
		});

		if (result === "no_unvectorized_signals") {
			queueMessage.ack();
			return;
		}

		if (result === "missing_vectorize_index") {
			console.warn(
				`[yt-vectorize] No vectorize index available — acking transcript ${transcriptId} (vectorize/cluster steps skipped)`
			);
			queueMessage.ack();
			return;
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
	deps: YtVectorizeDependencies = {}
) => {
	for (const queueMessage of batch.messages) {
		await handleVectorizeMessage(queueMessage, deps);
	}
};
