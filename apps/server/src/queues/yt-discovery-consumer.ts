import { ytDiscoveryQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import {
	processYtDiscoveryMessage,
	type YtDiscoveryDependencies,
} from "@my-app/api/services/youtube/discovery";

const MAX_RETRY_ATTEMPTS = 3;

const handleDiscoveryMessage = async (
	queueMessage: Message,
	dependencies: YtDiscoveryDependencies
) => {
	const parsed = ytDiscoveryQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-discovery] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { feedId } = parsed.data;

	try {
		const result = await processYtDiscoveryMessage({
			message: parsed.data,
			dependencies,
		});

		if (result === "skipped_inactive_or_missing") {
			console.warn(
				`[yt-discovery] Feed ${feedId} not found or not active, skipping`
			);
			queueMessage.ack();
			return;
		}

		queueMessage.ack();
	} catch (error) {
		console.error(`[yt-discovery] Failed to process feed ${feedId}:`, error);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 60, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtDiscoveryBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtDiscoveryDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleDiscoveryMessage(queueMessage, dependencies);
	}
};
