import { db as defaultDb } from "@my-app/db";
import { booking } from "@my-app/db/schema/marketplace";
import type { DomainEvent } from "@my-app/events";
import {
	clearEventPushers as clearDomainEventPushers,
	emitDomainEvent as emitDomainEventBase,
	registerEventPusher,
} from "@my-app/events";
import { eq } from "drizzle-orm";
import type { EmitNotificationEventInput } from "./contracts";
import { type NotificationQueueProducer, notificationsPusher } from "./pusher";

type Db = typeof defaultDb;

const mapEventToNotificationInput = async (
	event: DomainEvent,
	db: Db,
): Promise<EmitNotificationEventInput | null> => {
	switch (event.type) {
		case "booking:confirmed":
		case "booking:cancelled": {
			const { bookingId } = event.data as { bookingId: string };
			const [row] = await db
				.select({
					customerUserId: booking.customerUserId,
					organizationId: booking.organizationId,
				})
				.from(booking)
				.where(eq(booking.id, bookingId))
				.limit(1);
			if (!row?.customerUserId) {
				return null;
			}
			return {
				organizationId: event.organizationId,
				actorUserId: event.actorUserId,
				eventType: event.type,
				idempotencyKey: event.idempotencyKey,
				payload: {
					recipients: [
						{
							userId: row.customerUserId,
							channels: ["in_app"],
							title:
								event.type === "booking:confirmed"
									? "Booking confirmed"
									: "Booking cancelled",
							severity: event.type === "booking:confirmed" ? "success" : "info",
						},
					],
				},
			};
		}
		case "booking:created":
		case "payment:captured":
		case "payment:failed":
			return null;
		default:
			return null;
	}
};

export const registerNotificationEventPusher = (
	queue?: NotificationQueueProducer,
	db?: Db,
): void => {
	const resolvedDb = db ?? defaultDb;
	registerEventPusher(async (event) => {
		const input = await mapEventToNotificationInput(event, resolvedDb);
		if (!input) {
			return;
		}
		await notificationsPusher({
			input,
			queue,
		});
	});
};

export const clearEventPushers = clearDomainEventPushers;
export const emitDomainEvent = emitDomainEventBase;
