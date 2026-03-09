import { clearEventPushers, emitDomainEvent, registerEventPusher } from "@my-app/events";
import type { DomainEvent } from "@my-app/events";
import type { EmitNotificationEventInput } from "./contracts";
import { type NotificationQueueProducer, notificationsPusher } from "./pusher";

const mapEventToNotificationInput = (event: DomainEvent): EmitNotificationEventInput | null => {
	// Map each event type to notification. Return null to skip silent events.
	// Recipients are empty for now — domain packages populate them in Phase 3+.
	switch (event.type) {
		case "booking:created":
		case "booking:confirmed":
		case "booking:cancelled":
		case "payment:captured":
		case "payment:failed":
			return {
				organizationId: event.organizationId,
				actorUserId: event.actorUserId,
				eventType: event.type,
				idempotencyKey: event.idempotencyKey,
				payload: { recipients: [] },
			};
		default:
			return null;
	}
};

export const registerNotificationEventPusher = (queue?: NotificationQueueProducer): void => {
	registerEventPusher(async (event, q) => {
		const input = mapEventToNotificationInput(event);
		if (!input) return;
		await notificationsPusher({
			input,
			queue: (q as NotificationQueueProducer | undefined) ?? queue,
		});
	});
};

export { clearEventPushers, emitDomainEvent };
