import { db } from "@full-stack-cf-app/db";
import { telegramNotification } from "@full-stack-cf-app/db/schema/support";
import { createTelegramNotificationDispatchMessage } from "@full-stack-cf-app/notifications/contracts";

import type { NotificationQueueProducer } from "../context";
import type { TelegramQueueStrategy } from "./adapters";

/**
 * Queue-based Telegram delivery:
 * 1. Inserts a telegramNotification record (idempotent via idempotencyKey)
 * 2. Sends to the notification queue for async worker processing
 *
 * This encapsulates the legacy telegram dispatch path so it flows
 * through the adapter pattern rather than being a separate code path.
 */
export const createTelegramQueueStrategy = (
	notificationQueue?: NotificationQueueProducer
): TelegramQueueStrategy => ({
	enqueue: async (params) => {
		const idempotencyKey = `support.ticket.reply.telegram:${params.messageId}`;
		const notificationId = crypto.randomUUID();
		const payload = JSON.stringify({
			ticketId: params.ticketId,
			messageId: params.messageId,
			channel: params.channel,
			body: params.body,
		});

		let inserted = false;
		try {
			await db.insert(telegramNotification).values({
				id: notificationId,
				organizationId: params.organizationId,
				ticketId: params.ticketId,
				requestedByUserId: params.requestedByUserId ?? null,
				templateKey: "support.ticket.reply",
				recipientChatId: params.recipientChatId,
				idempotencyKey,
				payload,
				status: "queued",
				attemptCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			inserted = true;
		} catch {
			// Idempotency conflict — already queued, silently succeed
		}

		if (inserted && notificationQueue) {
			try {
				await notificationQueue.send(
					createTelegramNotificationDispatchMessage({
						notificationId,
						organizationId: params.organizationId,
					}),
					{ contentType: "json" }
				);
			} catch (error) {
				console.error("Failed to enqueue telegram ticket reply", error);
			}
		}

		return { notificationId };
	},
});
