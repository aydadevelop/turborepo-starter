import { notificationQueueMessageSchema } from "@my-app/notifications/contracts";
import { NotificationProcessorService } from "@my-app/notifications/processor";

const MAX_RETRY_ATTEMPTS = 5;

const processor = new NotificationProcessorService();

const handleEventQueueMessage = async (
	queueMessage: Message,
	eventId: string
) => {
	const result = await processor.processEventById(eventId);
	if (result.status === "processed" || result.status === "already_processed") {
		queueMessage.ack();
		return;
	}

	if (result.status === "not_found" && queueMessage.attempts < 3) {
		queueMessage.retry({ delaySeconds: 15 });
		return;
	}

	if (
		result.status === "failed" &&
		result.reason === "exception" &&
		queueMessage.attempts < MAX_RETRY_ATTEMPTS
	) {
		queueMessage.retry({
			delaySeconds: Math.min(queueMessage.attempts * 30, 300),
		});
		return;
	}

	queueMessage.ack();
};

export const processNotificationBatch = async (
	batch: MessageBatch<unknown>
) => {
	for (const queueMessage of batch.messages) {
		const parsed = notificationQueueMessageSchema.safeParse(queueMessage.body);
		if (!parsed.success) {
			console.error("Unknown notification queue message", queueMessage.body);
			queueMessage.ack();
			continue;
		}

		await handleEventQueueMessage(queueMessage, parsed.data.eventId);
	}
};
