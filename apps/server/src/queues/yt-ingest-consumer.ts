import { ytIngestQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import {
	processYtIngestMessage,
	type YtIngestDependencies,
} from "@my-app/api/services/youtube/ingest";

const MAX_RETRY_ATTEMPTS = 3;

const handleIngestMessage = async (
	queueMessage: Message,
	dependencies: YtIngestDependencies
) => {
	const parsed = ytIngestQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-ingest] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { videoId } = parsed.data;

	try {
		await processYtIngestMessage({
			message: parsed.data,
			dependencies,
		});

		queueMessage.ack();
	} catch (error) {
		console.error(`[yt-ingest] Failed to ingest video ${videoId}:`, error);

		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 60, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtIngestBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtIngestDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleIngestMessage(queueMessage, dependencies);
	}
};
