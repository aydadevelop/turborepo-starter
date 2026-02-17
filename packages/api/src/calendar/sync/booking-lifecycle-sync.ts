import { db } from "@full-stack-cf-app/db";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingCancellationRequest,
	bookingShiftRequest,
} from "@full-stack-cf-app/db/schema/booking";
import { notificationsPusher } from "@full-stack-cf-app/notifications/pusher";
import { and, eq } from "drizzle-orm";

import type { NotificationQueueProducer } from "../../context";
import { resolveBookingNotificationUserIds } from "../../lib/booking-notification-recipients";
import { buildRecipients } from "../../lib/event-bus";
import type { CalendarEventsResult } from "../adapters/types";

const terminalBookingStatuses = new Set(["cancelled", "completed", "no_show"]);
const EXTERNAL_SHIFT_REASON = "Requested from external calendar event update";
const EXTERNAL_CANCELLATION_REASON =
	"Requested from external calendar event deletion";

const resolveEventInterval = (
	event: CalendarEventsResult["events"][number]
): { startsAt: Date; endsAt: Date } | null => {
	if (!(event.startsAt && event.endsAt)) {
		return null;
	}
	if (event.startsAt >= event.endsAt) {
		return null;
	}
	return {
		startsAt: event.startsAt,
		endsAt: event.endsAt,
	};
};

const computePayNowCents = (value: typeof booking.$inferSelect) => {
	const discountedBaseCents = Math.max(
		value.basePriceCents - value.discountAmountCents,
		0
	);
	return Math.max(value.totalPriceCents - discountedBaseCents, 0);
};

const intervalsMatch = (params: {
	currentStartsAt: Date;
	currentEndsAt: Date;
	proposedStartsAt: Date;
	proposedEndsAt: Date;
}) =>
	params.currentStartsAt.getTime() === params.proposedStartsAt.getTime() &&
	params.currentEndsAt.getTime() === params.proposedEndsAt.getTime();

const emitLifecycleNotification = async (params: {
	queue?: NotificationQueueProducer;
	organizationId: string;
	sourceId: string;
	eventType: string;
	idempotencyKey: string;
	title: string;
	body: string;
	bookingId: string;
	userIds: Array<string | null | undefined>;
}) => {
	if (!params.queue) {
		return;
	}

	const userIds = await resolveBookingNotificationUserIds({
		organizationId: params.organizationId,
		userIds: params.userIds,
		includeBookingManagers: true,
	});
	const recipients = buildRecipients({
		userIds,
		title: params.title,
		body: params.body,
		ctaUrl: "/bookings",
		metadata: {
			bookingId: params.bookingId,
			source: "external_calendar",
		},
	});
	if (recipients.length === 0) {
		return;
	}

	await notificationsPusher({
		input: {
			organizationId: params.organizationId,
			eventType: params.eventType,
			sourceType: "booking",
			sourceId: params.sourceId,
			idempotencyKey: params.idempotencyKey,
			payload: {
				recipients,
			},
		},
		queue: params.queue as Parameters<typeof notificationsPusher>[0]["queue"],
	});
};

const upsertExternalCancellationRequest = async (params: {
	managedBooking: typeof booking.$inferSelect;
	syncedAt: Date;
}) => {
	const [existingRequest] = await db
		.select()
		.from(bookingCancellationRequest)
		.where(eq(bookingCancellationRequest.bookingId, params.managedBooking.id))
		.limit(1);

	if (
		existingRequest &&
		existingRequest.status === "requested" &&
		existingRequest.requestedByUserId === null &&
		existingRequest.reason === EXTERNAL_CANCELLATION_REASON &&
		existingRequest.reviewedByUserId === null &&
		existingRequest.reviewedAt === null
	) {
		return {
			request: existingRequest,
			changed: false,
		};
	}

	if (existingRequest) {
		await db
			.update(bookingCancellationRequest)
			.set({
				status: "requested",
				requestedByUserId: null,
				reason: EXTERNAL_CANCELLATION_REASON,
				requestedAt: params.syncedAt,
				reviewedByUserId: null,
				reviewedAt: null,
				reviewNote: null,
				updatedAt: params.syncedAt,
			})
			.where(eq(bookingCancellationRequest.id, existingRequest.id));
	} else {
		await db.insert(bookingCancellationRequest).values({
			id: crypto.randomUUID(),
			bookingId: params.managedBooking.id,
			organizationId: params.managedBooking.organizationId,
			requestedByUserId: null,
			reason: EXTERNAL_CANCELLATION_REASON,
			status: "requested",
			requestedAt: params.syncedAt,
			createdAt: params.syncedAt,
			updatedAt: params.syncedAt,
		});
	}

	const [savedRequest] = await db
		.select()
		.from(bookingCancellationRequest)
		.where(eq(bookingCancellationRequest.bookingId, params.managedBooking.id))
		.limit(1);
	if (!savedRequest) {
		throw new Error("Failed to save booking cancellation request");
	}

	return {
		request: savedRequest,
		changed: true,
	};
};

const upsertExternalShiftRequest = async (params: {
	managedBooking: typeof booking.$inferSelect;
	proposedStartsAt: Date;
	proposedEndsAt: Date;
	syncedAt: Date;
}) => {
	const [existingRequest] = await db
		.select()
		.from(bookingShiftRequest)
		.where(eq(bookingShiftRequest.bookingId, params.managedBooking.id))
		.limit(1);

	if (
		existingRequest &&
		existingRequest.status === "pending" &&
		existingRequest.initiatedByRole === "manager" &&
		existingRequest.customerDecision === "pending" &&
		existingRequest.managerDecision === "approved" &&
		existingRequest.reason === EXTERNAL_SHIFT_REASON &&
		intervalsMatch({
			currentStartsAt: existingRequest.proposedStartsAt,
			currentEndsAt: existingRequest.proposedEndsAt,
			proposedStartsAt: params.proposedStartsAt,
			proposedEndsAt: params.proposedEndsAt,
		})
	) {
		return {
			request: existingRequest,
			changed: false,
		};
	}

	const currentPayNowCents = computePayNowCents(params.managedBooking);
	const shiftDraft: Omit<
		typeof bookingShiftRequest.$inferInsert,
		"id" | "bookingId" | "organizationId" | "createdAt"
	> = {
		requestedByUserId: null,
		initiatedByRole: "manager",
		status: "pending",
		customerDecision: "pending",
		customerDecisionByUserId: null,
		customerDecisionAt: null,
		customerDecisionNote: null,
		managerDecision: "approved",
		managerDecisionByUserId: null,
		managerDecisionAt: params.syncedAt,
		managerDecisionNote: EXTERNAL_SHIFT_REASON,
		currentStartsAt: params.managedBooking.startsAt,
		currentEndsAt: params.managedBooking.endsAt,
		proposedStartsAt: params.proposedStartsAt,
		proposedEndsAt: params.proposedEndsAt,
		currentPassengers: params.managedBooking.passengers,
		proposedPassengers: params.managedBooking.passengers,
		currentBasePriceCents: params.managedBooking.basePriceCents,
		currentDiscountAmountCents: params.managedBooking.discountAmountCents,
		proposedBasePriceCents: params.managedBooking.basePriceCents,
		proposedDiscountAmountCents: params.managedBooking.discountAmountCents,
		currentTotalPriceCents: params.managedBooking.totalPriceCents,
		proposedTotalPriceCents: params.managedBooking.totalPriceCents,
		currentPayNowCents,
		proposedPayNowCents: currentPayNowCents,
		priceDeltaCents: 0,
		payNowDeltaCents: 0,
		currency: params.managedBooking.currency.toUpperCase(),
		discountCode: null,
		reason: EXTERNAL_SHIFT_REASON,
		rejectedByUserId: null,
		rejectedAt: null,
		rejectionReason: null,
		appliedByUserId: null,
		appliedAt: null,
		paymentAdjustmentStatus: "none",
		paymentAdjustmentAmountCents: 0,
		paymentAdjustmentReference: null,
		requestedAt: params.syncedAt,
		metadata: JSON.stringify({
			source: "external_calendar",
			externalUpdateAt: params.syncedAt.toISOString(),
		}),
		updatedAt: params.syncedAt,
	};

	if (existingRequest) {
		await db
			.update(bookingShiftRequest)
			.set(shiftDraft)
			.where(eq(bookingShiftRequest.id, existingRequest.id));
	} else {
		await db.insert(bookingShiftRequest).values({
			id: crypto.randomUUID(),
			bookingId: params.managedBooking.id,
			organizationId: params.managedBooking.organizationId,
			createdAt: params.syncedAt,
			...shiftDraft,
		});
	}

	const [savedRequest] = await db
		.select()
		.from(bookingShiftRequest)
		.where(eq(bookingShiftRequest.bookingId, params.managedBooking.id))
		.limit(1);
	if (!savedRequest) {
		throw new Error("Failed to save booking shift request");
	}

	return {
		request: savedRequest,
		changed: true,
	};
};

const resolveBoatName = async (boatId: string) => {
	const [boatRecord] = await db
		.select({
			name: boat.name,
		})
		.from(boat)
		.where(eq(boat.id, boatId))
		.limit(1);
	return boatRecord?.name ?? "Boat booking";
};

export const syncManagedBookingLifecycleFromExternalEvent = async (params: {
	provider: typeof bookingCalendarLink.$inferSelect.provider;
	externalCalendarId: string;
	event: CalendarEventsResult["events"][number];
	syncedAt: Date;
	notificationQueue?: NotificationQueueProducer;
}) => {
	const [calendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(
			and(
				eq(bookingCalendarLink.provider, params.provider),
				eq(bookingCalendarLink.externalCalendarId, params.externalCalendarId),
				eq(bookingCalendarLink.externalEventId, params.event.externalEventId)
			)
		)
		.limit(1);
	if (!calendarLink) {
		return {
			handled: false,
			action: "none" as const,
		};
	}

	const [managedBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, calendarLink.bookingId))
		.limit(1);
	if (!managedBooking) {
		return {
			handled: false,
			action: "none" as const,
		};
	}

	if (terminalBookingStatuses.has(managedBooking.status)) {
		return {
			handled: true,
			action: "ignored_terminal" as const,
		};
	}

	const interval = resolveEventInterval(params.event);
	const isCancellationLike = params.event.status === "cancelled" || !interval;

	if (isCancellationLike) {
		const cancellationResult = await upsertExternalCancellationRequest({
			managedBooking,
			syncedAt: params.syncedAt,
		});
		if (cancellationResult.changed) {
			const boatName = await resolveBoatName(managedBooking.boatId);
			await emitLifecycleNotification({
				queue: params.notificationQueue,
				organizationId: managedBooking.organizationId,
				sourceId: managedBooking.id,
				eventType: "booking.cancellation.requested.external",
				idempotencyKey: `booking.cancellation.requested.external:${cancellationResult.request.id}:${cancellationResult.request.updatedAt.toISOString()}`,
				title: "Cancellation request created",
				body: `${boatName}: calendar event was removed`,
				bookingId: managedBooking.id,
				userIds: [managedBooking.customerUserId, managedBooking.createdByUserId],
			});
		}

		return {
			handled: true,
			action: "cancellation_requested" as const,
			changed: cancellationResult.changed,
		};
	}

	if (
		intervalsMatch({
			currentStartsAt: managedBooking.startsAt,
			currentEndsAt: managedBooking.endsAt,
			proposedStartsAt: interval.startsAt,
			proposedEndsAt: interval.endsAt,
		})
	) {
		return {
			handled: true,
			action: "none" as const,
			changed: false,
		};
	}

	const shiftResult = await upsertExternalShiftRequest({
		managedBooking,
		proposedStartsAt: interval.startsAt,
		proposedEndsAt: interval.endsAt,
		syncedAt: params.syncedAt,
	});
	if (shiftResult.changed) {
		const boatName = await resolveBoatName(managedBooking.boatId);
		await emitLifecycleNotification({
			queue: params.notificationQueue,
			organizationId: managedBooking.organizationId,
			sourceId: managedBooking.id,
			eventType: "booking.shift.requested.external",
			idempotencyKey: `booking.shift.requested.external:${shiftResult.request.id}:${shiftResult.request.updatedAt.toISOString()}`,
			title: "Shift request created",
			body: `${boatName}: ${interval.startsAt.toISOString()} - ${interval.endsAt.toISOString()}`,
			bookingId: managedBooking.id,
			userIds: [managedBooking.customerUserId, managedBooking.createdByUserId],
		});
	}

	return {
		handled: true,
		action: "shift_requested" as const,
		changed: shiftResult.changed,
	};
};
