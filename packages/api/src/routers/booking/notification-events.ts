import type { booking } from "@full-stack-cf-app/db/schema/booking";
import { notificationsPusher } from "@full-stack-cf-app/notifications/pusher";

import type { NotificationQueueProducer } from "../../context";

type BookingNotificationRecord = Pick<
	typeof booking.$inferSelect,
	| "id"
	| "organizationId"
	| "startsAt"
	| "endsAt"
	| "customerUserId"
	| "createdByUserId"
>;

const uniqueUserIds = (values: Array<string | null | undefined>) => {
	return values.filter((value, index, array): value is string => {
		return Boolean(value) && array.indexOf(value) === index;
	});
};

const buildBookingWindowText = (params: {
	boatName: string;
	booking: BookingNotificationRecord;
}) => {
	return `${params.boatName}: ${params.booking.startsAt.toISOString()} - ${params.booking.endsAt.toISOString()}`;
};

export const emitBookingCreatedNotificationEvent = async (params: {
	queue?: NotificationQueueProducer;
	actorUserId?: string;
	booking: BookingNotificationRecord;
	boatName: string;
	recipientUserIds?: Array<string | null | undefined>;
}) => {
	const recipientUserIds = params.recipientUserIds ?? [
		params.booking.customerUserId,
		params.booking.createdByUserId,
		params.actorUserId,
	];
	const recipients = uniqueUserIds(recipientUserIds).map((userId) => ({
		userId,
		title: "Booking created",
		body: buildBookingWindowText({
			boatName: params.boatName,
			booking: params.booking,
		}),
		ctaUrl: `/dashboard/bookings/${params.booking.id}`,
		channels: ["in_app"] as "in_app"[],
		metadata: {
			bookingId: params.booking.id,
		},
	}));
	if (recipients.length === 0) {
		return;
	}

	await notificationsPusher({
		input: {
			organizationId: params.booking.organizationId,
			actorUserId: params.actorUserId,
			eventType: "booking.created",
			sourceType: "booking",
			sourceId: params.booking.id,
			idempotencyKey: `booking.created:${params.booking.id}`,
			payload: {
				recipients,
			},
		},
		queue: params.queue,
	});
};

export const emitBookingCancelledNotificationEvent = async (params: {
	queue?: NotificationQueueProducer;
	actorUserId?: string;
	booking: BookingNotificationRecord;
	boatName: string;
	occurredAt?: Date;
	recipientUserIds?: Array<string | null | undefined>;
}) => {
	const recipientUserIds = params.recipientUserIds ?? [
		params.booking.customerUserId,
		params.booking.createdByUserId,
		params.actorUserId,
	];
	const recipients = uniqueUserIds(recipientUserIds).map((userId) => ({
		userId,
		title: "Booking cancelled",
		body: buildBookingWindowText({
			boatName: params.boatName,
			booking: params.booking,
		}),
		ctaUrl: `/dashboard/bookings/${params.booking.id}`,
		channels: ["in_app"] as "in_app"[],
		severity: "warning" as const,
		metadata: {
			bookingId: params.booking.id,
		},
	}));
	if (recipients.length === 0) {
		return;
	}

	const occurredAt = params.occurredAt ?? new Date();
	await notificationsPusher({
		input: {
			organizationId: params.booking.organizationId,
			actorUserId: params.actorUserId,
			eventType: "booking.cancelled",
			sourceType: "booking",
			sourceId: params.booking.id,
			idempotencyKey: `booking.cancelled:${params.booking.id}:${occurredAt.toISOString()}`,
			payload: {
				recipients,
			},
		},
		queue: params.queue,
	});
};
