import type {
	EmitNotificationEventInput,
	NotificationRecipientInput,
} from "@full-stack-cf-app/notifications/contracts";
import { notificationsPusher } from "@full-stack-cf-app/notifications/pusher";

import type { NotificationQueueProducer } from "../context";

// ─── Domain event types ────────────────────────────────────────────────

export interface BookingNotificationPayload {
	bookingId: string;
	boatName: string;
	windowText: string;
}

export interface BookingRefundPayload extends BookingNotificationPayload {
	refundId: string;
	refundAmountCents: number;
	formattedAmount: string;
}

export interface SupportTicketNotificationPayload {
	ticketId: string;
	subject: string;
	source?: string;
	priority?: string;
}

export interface SupportTicketStatusPayload
	extends SupportTicketNotificationPayload {
	fromStatus: string;
	toStatus: string;
}

export interface DomainEventMap {
	"booking.created": BookingNotificationPayload;
	"booking.cancelled": BookingNotificationPayload;
	"booking.refund.processed": BookingRefundPayload;
	"support.ticket.created": SupportTicketNotificationPayload;
	"support.ticket.status_changed": SupportTicketStatusPayload;
	"support.ticket.sla_escalated": SupportTicketNotificationPayload & {
		previousStatus: string;
		dueAt: string | null;
	};
}

export type DomainEventType = keyof DomainEventMap;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
	type: T;
	organizationId: string;
	actorUserId?: string;
	sourceType: string;
	sourceId: string;
	payload: DomainEventMap[T];
	recipients: EventRecipient[];
}

export interface EventRecipient {
	userId: string;
	title: string;
	body?: string;
	ctaUrl?: string;
	channels?: NotificationRecipientInput["channels"];
	severity?: NotificationRecipientInput["severity"];
	metadata?: Record<string, unknown>;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const uniqueRecipientUserIds = (
	values: Array<string | null | undefined>
): string[] =>
	values.filter((value, index, array): value is string => {
		return Boolean(value) && array.indexOf(value) === index;
	});

/**
 * Format a money amount in cents for notification display.
 */
export const formatRefundAmount = (params: {
	amountCents: number;
	currency: string;
}): string => {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: params.currency,
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 2,
		}).format(params.amountCents / 100);
	} catch {
		return `${(params.amountCents / 100).toFixed(2)} ${params.currency}`;
	}
};

/**
 * Build a recipient list from a list of potentially-null user IDs,
 * applying the same title/body/ctaUrl to all.
 */
export const buildRecipients = (params: {
	userIds: Array<string | null | undefined>;
	title: string;
	body?: string;
	ctaUrl?: string;
	channels?: NotificationRecipientInput["channels"];
	severity?: NotificationRecipientInput["severity"];
	metadata?: Record<string, unknown>;
}): EventRecipient[] =>
	uniqueRecipientUserIds(params.userIds).map((userId) => ({
		userId,
		title: params.title,
		body: params.body,
		ctaUrl: params.ctaUrl,
		channels: params.channels ?? ["in_app"],
		severity: params.severity,
		metadata: params.metadata,
	}));

// ─── EventBus ──────────────────────────────────────────────────────────

export class EventBus {
	private events: DomainEvent[] = [];

	emit<T extends DomainEventType>(event: DomainEvent<T>): void {
		if (event.recipients.length === 0) {
			return;
		}
		this.events.push(event);
	}

	get pending(): readonly DomainEvent[] {
		return this.events;
	}

	get size(): number {
		return this.events.length;
	}

	async flush(queue?: NotificationQueueProducer): Promise<void> {
		const eventsToFlush = [...this.events];
		this.events = [];

		for (const event of eventsToFlush) {
			const input: EmitNotificationEventInput = {
				organizationId: event.organizationId,
				actorUserId: event.actorUserId,
				eventType: event.type,
				sourceType: event.sourceType,
				sourceId: event.sourceId,
				idempotencyKey: buildIdempotencyKey(event),
				payload: {
					recipients: event.recipients.map((r) => ({
						userId: r.userId,
						title: r.title,
						body: r.body,
						ctaUrl: r.ctaUrl,
						channels: r.channels ?? ["in_app"],
						severity: r.severity,
						metadata: r.metadata,
					})),
				},
			};

			try {
				await notificationsPusher({ input, queue });
			} catch (error) {
				console.error(`Failed to emit ${event.type} event`, error);
			}
		}
	}
}

const buildIdempotencyKey = (event: DomainEvent): string => {
	const base = `${event.type}:${event.sourceId}`;
	if (
		event.type === "booking.refund.processed" &&
		"refundId" in event.payload
	) {
		return `${base}:${(event.payload as BookingRefundPayload).refundId}`;
	}
	return base;
};
