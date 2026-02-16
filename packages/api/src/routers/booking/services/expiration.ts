import { db } from "@full-stack-cf-app/db";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import { createBookingExpirationCheckMessage } from "@full-stack-cf-app/notifications/contracts";
import { and, eq, inArray, lte } from "drizzle-orm";

import type { NotificationQueueProducer } from "../../../context";
import {
	EventBus,
	buildRecipients,
} from "../../../lib/event-bus";
import { applyCancellationPolicyAndRefund } from "../cancellation/policy.service";
import { cancelBookingAndSync } from "./calendar-sync";

export const BOOKING_EXPIRY_SECONDS = 2 * 60; // 2 minutes

/**
 * Enqueue a delayed expiration check for a booking.
 * The message will be delivered after BOOKING_EXPIRY_SECONDS.
 */
export const enqueueBookingExpirationCheck = async (
	bookingId: string,
	queue?: NotificationQueueProducer
): Promise<void> => {
	if (!queue) {
		return;
	}
	try {
		await queue.send(createBookingExpirationCheckMessage(bookingId), {
			contentType: "json",
			delaySeconds: BOOKING_EXPIRY_SECONDS,
		});
	} catch (error) {
		console.error(
			`[booking-expiration] Failed to enqueue expiration check for ${bookingId}:`,
			error
		);
	}
};

/**
 * Check a single booking and expire it if still unpaid.
 * Called by the queue consumer when the delayed message arrives.
 */
export const expireBookingIfUnpaid = async (
	bookingId: string,
	queue?: NotificationQueueProducer
): Promise<{ expired: boolean; reason: string }> => {
	const EXPIRABLE_STATUSES = ["pending", "awaiting_payment"] as const;
	const EXPIRABLE_PAYMENT_STATUSES = ["unpaid", "failed"] as const;
	const cutoff = new Date(Date.now() - BOOKING_EXPIRY_SECONDS * 1000);

	const [targetBooking] = await db
		.select()
		.from(booking)
		.where(
			and(
				eq(booking.id, bookingId),
				inArray(booking.status, [...EXPIRABLE_STATUSES]),
				inArray(booking.paymentStatus, [...EXPIRABLE_PAYMENT_STATUSES]),
				lte(booking.createdAt, cutoff)
			)
		)
		.limit(1);

	if (!targetBooking) {
		return { expired: false, reason: "not_eligible" };
	}

	await cancelBookingAndSync({
		managedBooking: targetBooking,
		reason: "Payment timeout — booking expired automatically",
	});

	await applyCancellationPolicyAndRefund({
		bookingId: targetBooking.id,
		actor: "system",
		reason: "Automatic expiration: payment not received in time",
	});

	const eventBus = new EventBus();

	const [boatRecord] = await db
		.select({ name: boat.name })
		.from(boat)
		.where(eq(boat.id, targetBooking.boatId))
		.limit(1);

	const boatName = boatRecord?.name ?? targetBooking.boatId;
	const start = new Intl.DateTimeFormat("en-US", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(targetBooking.startsAt));
	const end = new Intl.DateTimeFormat("en-US", {
		timeStyle: "short",
	}).format(new Date(targetBooking.endsAt));

	eventBus.emit({
		type: "booking.cancelled",
		organizationId: targetBooking.organizationId,
		sourceType: "booking",
		sourceId: targetBooking.id,
		payload: {
			bookingId: targetBooking.id,
			boatName,
			windowText: `${start} – ${end}`,
		},
		recipients: buildRecipients({
			userIds: [
				targetBooking.customerUserId,
				targetBooking.createdByUserId,
			],
			title: "Booking expired",
			body: `${boatName}: ${start} – ${end} was cancelled due to payment timeout`,
			ctaUrl: "/bookings",
			severity: "warning",
			metadata: { bookingId: targetBooking.id },
		}),
	});

	await eventBus.flush(queue);

	console.log(`[booking-expiration] expired booking ${bookingId}`);
	return { expired: true, reason: "expired" };
};
