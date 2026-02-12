import { db } from "@full-stack-cf-app/db";
import { notificationEvent } from "@full-stack-cf-app/db/schema/notification";
import { and, eq } from "drizzle-orm";

import {
	createNotificationQueueMessage,
	type EmitNotificationEventInput,
	emitNotificationEventInputSchema,
	type NotificationQueueMessage,
} from "./contracts";

export interface NotificationQueueProducer {
	send(
		message: NotificationQueueMessage,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

export interface NotificationEventPublishedHint {
	eventId: string;
	organizationId: string;
	eventType: string;
	recipientUserIds: string[];
	occurredAt: number;
}

type NotificationEventPublishedListener = (
	hint: NotificationEventPublishedHint
) => void;

const notificationEventPublishedListeners = new Set<
	NotificationEventPublishedListener
>();

export const subscribeNotificationEventPublished = (
	listener: NotificationEventPublishedListener
) => {
	notificationEventPublishedListeners.add(listener);
	return () => {
		notificationEventPublishedListeners.delete(listener);
	};
};

const publishNotificationEventHint = (hint: NotificationEventPublishedHint) => {
	for (const listener of notificationEventPublishedListeners) {
		try {
			listener(hint);
		} catch (error) {
			console.error("Notification event listener failed", error);
		}
	}
};

export const notificationsPusher = async (params: {
	input: EmitNotificationEventInput;
	queue?: NotificationQueueProducer;
}) => {
	const input = emitNotificationEventInputSchema.parse(params.input);

	const [existingEvent] = await db
		.select()
		.from(notificationEvent)
		.where(
			and(
				eq(notificationEvent.organizationId, input.organizationId),
				eq(notificationEvent.idempotencyKey, input.idempotencyKey)
			)
		)
		.limit(1);

	if (existingEvent) {
		return {
			idempotent: true,
			queued: existingEvent.status === "queued",
			event: existingEvent,
		};
	}

	const eventId = crypto.randomUUID();
	const recipientUserIds = Array.from(
		new Set(input.payload.recipients.map((recipient) => recipient.userId))
	);
	await db.insert(notificationEvent).values({
		id: eventId,
		organizationId: input.organizationId,
		actorUserId: input.actorUserId,
		eventType: input.eventType,
		sourceType: input.sourceType,
		sourceId: input.sourceId,
		idempotencyKey: input.idempotencyKey,
		payload: JSON.stringify(input.payload),
		status: "queued",
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const [createdEvent] = await db
		.select()
		.from(notificationEvent)
		.where(eq(notificationEvent.id, eventId))
		.limit(1);
	if (!createdEvent) {
		throw new Error("Failed to create notification event");
	}

	publishNotificationEventHint({
		eventId: createdEvent.id,
		organizationId: createdEvent.organizationId,
		eventType: createdEvent.eventType,
		recipientUserIds,
		occurredAt: createdEvent.createdAt.getTime(),
	});

	const markEventFailed = async (failureReason: string) => {
		await db
			.update(notificationEvent)
			.set({
				status: "failed",
				failureReason,
				updatedAt: new Date(),
			})
			.where(eq(notificationEvent.id, createdEvent.id));
	};

	let queuePublished = false;
	if (params.queue) {
		try {
			await params.queue.send(createNotificationQueueMessage(createdEvent.id), {
				contentType: "json",
			});
			queuePublished = true;
		} catch (error) {
			const failureReason =
				error instanceof Error ? error.message : "Queue publish failed";
			await markEventFailed(
				`queue_publish_failed:${failureReason}`.slice(0, 2000)
			);
		}
	} else {
		await markEventFailed("queue_missing_binding:no_queue_or_inline_processor");
	}

	return {
		idempotent: false,
		queued: queuePublished,
		event: createdEvent,
	};
};
