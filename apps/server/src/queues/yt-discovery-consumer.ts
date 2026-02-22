import { ytDiscoveryQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytFeed } from "@my-app/db/schema/youtube";
import { and, eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 3;

interface QueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

interface YtDiscoveryDependencies {
	ytIngestQueue?: QueueProducer;
}

const handleDiscoveryMessage = async (
	queueMessage: Message,
	_dependencies: YtDiscoveryDependencies
) => {
	const parsed = ytDiscoveryQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-discovery] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { feedId, organizationId } = parsed.data;

	try {
		// 1. Look up the feed to get the search query
		const [feed] = await db
			.select()
			.from(ytFeed)
			.where(
				and(eq(ytFeed.id, feedId), eq(ytFeed.organizationId, organizationId))
			)
			.limit(1);

		if (!feed || feed.status !== "active") {
			console.warn(
				`[yt-discovery] Feed ${feedId} not found or not active, skipping`
			);
			queueMessage.ack();
			return;
		}

		// 2. Use ytdlp-nodejs to search YouTube
		// NOTE: ytdlp-nodejs requires a native binary, so this consumer
		// is designed to run on a Node.js backend (not CF Worker directly).
		// On CF Workers, this will be a stub that logs and acks.
		// In production, this would be delegated to a container/VM worker.
		console.log(
			`[yt-discovery] Searching YouTube for feed "${feed.name}": ${feed.searchQuery}`
		);

		// 3. Update feed last discovery time
		await db
			.update(ytFeed)
			.set({ lastDiscoveryAt: new Date() })
			.where(eq(ytFeed.id, feedId));

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
