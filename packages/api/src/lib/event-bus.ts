import {
	type NotificationRecipient,
	type NotificationRecipientInput,
	notificationRecipientSchema,
} from "@my-app/notifications/contracts";
import { notificationsPusher } from "@my-app/notifications/pusher";

export interface NotificationQueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

const uniqueUserIds = (values: Array<string | null | undefined>): string[] => {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (!value) {
			continue;
		}
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
	}
	return result;
};

export const buildRecipients = (params: {
	userIds: Array<string | null | undefined>;
	title: string;
	body?: string;
	ctaUrl?: string;
	severity?: "info" | "success" | "warning" | "error";
	channels?: NotificationRecipientInput["channels"];
	metadata?: Record<string, unknown>;
}): NotificationRecipient[] => {
	return uniqueUserIds(params.userIds).map((userId) => {
		return notificationRecipientSchema.parse({
			userId,
			title: params.title,
			body: params.body,
			ctaUrl: params.ctaUrl,
			severity: params.severity,
			channels: params.channels,
			metadata: params.metadata,
		});
	});
};

export interface EventBusEvent {
	type: string;
	organizationId: string;
	actorUserId?: string;
	sourceType?: string;
	sourceId?: string;
	idempotencyKey?: string;
	payload?: Record<string, unknown>;
	recipients: NotificationRecipientInput[];
}

export class EventBus {
	#events: EventBusEvent[] = [];

	get size(): number {
		return this.#events.length;
	}

	get pending(): ReadonlyArray<EventBusEvent> {
		return this.#events;
	}

	emit(event: EventBusEvent): void {
		if (event.recipients.length === 0) {
			return;
		}
		this.#events.push(event);
	}

	async flush(queue?: NotificationQueueProducer): Promise<void> {
		const events = [...this.#events];
		this.#events = [];

		for (const event of events) {
			try {
				await notificationsPusher({
					input: {
						organizationId: event.organizationId,
						actorUserId: event.actorUserId,
						eventType: event.type,
						sourceType: event.sourceType,
						sourceId: event.sourceId,
						idempotencyKey:
							event.idempotencyKey ??
							`${event.type}:${event.sourceType ?? "event"}:${event.sourceId ?? crypto.randomUUID()}`,
						payload: {
							recipients: event.recipients,
							metadata: event.payload,
						},
					},
					queue,
				});
			} catch (error) {
				console.error("Failed to flush notification event", error);
			}
		}
	}
}
