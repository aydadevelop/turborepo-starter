import { ytClusterQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import {
	processYtClusterMessage,
	type VectorizeIndex,
} from "@my-app/api/services/youtube/cluster";
import type { NotificationQueueProducer } from "@my-app/notifications/pusher";

interface YtClusterDependencies {
	vectorizeIndex?: VectorizeIndex;
	notificationQueue?: NotificationQueueProducer;
}

type LegacyClusterDependencies = VectorizeIndex;
type ClusterConsumerDependencies = YtClusterDependencies | LegacyClusterDependencies;

const isLegacyVectorizeIndex = (
	deps: ClusterConsumerDependencies
): deps is LegacyClusterDependencies =>
	typeof (deps as LegacyClusterDependencies).query === "function" &&
	!("vectorizeIndex" in deps);

const resolveVectorizeIndex = (
	deps: ClusterConsumerDependencies
): VectorizeIndex | undefined =>
	isLegacyVectorizeIndex(deps) ? deps : deps.vectorizeIndex;

const resolveNotificationQueue = (
	deps: ClusterConsumerDependencies
): NotificationQueueProducer | undefined =>
	isLegacyVectorizeIndex(deps) ? undefined : deps.notificationQueue;

const MAX_RETRY_ATTEMPTS = 3;

const handleClusterMessage = async (
	queueMessage: Message,
	deps: ClusterConsumerDependencies
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
			vectorizeIndex: resolveVectorizeIndex(deps),
			notificationQueue: resolveNotificationQueue(deps),
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
	deps: ClusterConsumerDependencies = {}
) => {
	for (const queueMessage of batch.messages) {
		await handleClusterMessage(queueMessage, deps);
	}
};
