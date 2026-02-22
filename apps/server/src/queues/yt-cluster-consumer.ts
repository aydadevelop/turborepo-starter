import { ytClusterQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytCluster, ytSignal } from "@my-app/db/schema/youtube";
import { and, eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 3;

const clusterTitleFromSignal = (text: string): string => {
	const normalized = text.trim().replace(/\s+/g, " ");
	if (normalized.length <= 120) {
		return normalized;
	}
	return `${normalized.slice(0, 117)}...`;
};

const handleClusterMessage = async (queueMessage: Message) => {
	const parsed = ytClusterQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-cluster] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { signalId, organizationId } = parsed.data;

	try {
		const [signal] = await db
			.select({
				id: ytSignal.id,
				clusterId: ytSignal.clusterId,
				organizationId: ytSignal.organizationId,
				type: ytSignal.type,
				severity: ytSignal.severity,
				text: ytSignal.text,
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
			console.warn(`[yt-cluster] Signal ${signalId} not found, skipping`);
			queueMessage.ack();
			return;
		}

		// Idempotency: if already clustered, treat as success.
		if (signal.clusterId) {
			queueMessage.ack();
			return;
		}

		const clusterId = crypto.randomUUID();

		await db.insert(ytCluster).values({
			id: clusterId,
			organizationId,
			title: clusterTitleFromSignal(signal.text),
			summary: null,
			type: signal.type,
			severity: signal.severity,
			signalCount: 1,
			impactScore: 1,
		});

		await db
			.update(ytSignal)
			.set({ clusterId })
			.where(eq(ytSignal.id, signalId));

		queueMessage.ack();
	} catch (error) {
		console.error(`[yt-cluster] Failed to process signal ${signalId}:`, error);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 30, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtClusterBatch = async (batch: MessageBatch<unknown>) => {
	for (const queueMessage of batch.messages) {
		await handleClusterMessage(queueMessage);
	}
};
