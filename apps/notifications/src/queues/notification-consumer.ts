import { notificationQueueMessageSchema } from "@my-app/notifications/contracts";
import { NotificationProcessorService } from "@my-app/notifications/processor";

const processor = new NotificationProcessorService();

export const handleNotificationJob = async (data: unknown): Promise<void> => {
	const parsed = notificationQueueMessageSchema.safeParse(data);
	if (!parsed.success) {
		console.error("Unknown notification queue message", data);
		return; // discard malformed messages
	}

	const result = await processor.processEventById(parsed.data.eventId);

	if (result.status === "processed" || result.status === "already_processed") {
		return;
	}

	if (result.status === "not_found") {
		throw new Error(
			`Notification event not found: ${parsed.data.eventId}, will retry`
		);
	}

	if (result.status === "failed") {
		throw new Error(
			`Notification processing failed: ${result.reason ?? "unknown"}`
		);
	}
};
