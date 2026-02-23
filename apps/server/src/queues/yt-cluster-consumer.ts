import { ytClusterQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import {
	processYtClusterMessage,
	type VectorizeIndex,
} from "@my-app/api/services/youtube/cluster";

const MAX_RETRY_ATTEMPTS = 3;

const handleClusterMessage = async (
	queueMessage: Message,
	vectorizeIndex?: VectorizeIndex
) => {
	const parsed = ytClusterQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-cluster] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { signalId, organizationId } = parsed.data;

	try {
		const result = await processYtClusterMessage({
			message: parsed.data,
			vectorizeIndex,
		});

		if (result === "not_found") {
			console.warn(`[yt-cluster] Signal ${signalId} not found, skipping`);
			queueMessage.ack();
			return;
		}

		queueMessage.ack();
	} catch (error) {
		console.error(
			`[yt-cluster] Failed to process signal ${signalId} (org ${organizationId}):`,
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

export const processYtClusterBatch = async (
	batch: MessageBatch<unknown>,
	vectorizeIndex?: VectorizeIndex
) => {
	for (const queueMessage of batch.messages) {
		await handleClusterMessage(queueMessage, vectorizeIndex);
	}
};
