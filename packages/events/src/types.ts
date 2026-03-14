export interface DomainEventMap {
	"booking:cancelled": {
		bookingId: string;
		reason: string;
		refundAmountKopeks: number;
	};
	"booking:confirmed": { bookingId: string; ownerId: string };
	"booking:contact-updated": {
		bookingId: string;
		contactDetails: Record<string, unknown>;
	};
	"booking:created": {
		bookingId: string;
		listingId: string;
		customerId: string;
	};
	"booking:schedule-updated": {
		bookingId: string;
		startsAt: string;
		endsAt: string;
		timezone: string | null;
	};
	"calendar:organization-connection-readiness-changed": {
		connectionId: string;
		isReady: boolean;
	};
	"calendar:sync-requested": { bookingId: string; calendarId: string };
	"dispute:opened": { disputeId: string; bookingId: string };
	"dispute:resolved": { disputeId: string; resolution: string };
	"listing:organization-publication-readiness-changed": {
		isReady: boolean;
		listingId: string;
		publicationId: string | null;
	};
	"payment:captured": {
		bookingId: string;
		paymentId: string;
		amountKopeks: number;
	};
	"payment:failed": { bookingId: string; paymentId: string; error: string };
	"payment:organization-config-readiness-changed": {
		configId: string;
		isReady: boolean;
	};
	"support:inbound-processed": {
		inboundMessageId: string;
		messageId: string;
		ticketId: string;
		channel: "telegram" | "avito" | "email" | "web" | "api";
	};
	"support:inbound-received": {
		inboundMessageId: string;
		channel: "telegram" | "avito" | "email" | "web" | "api";
	};
	"support:message-added": {
		ticketId: string;
		messageId: string;
		channel: "internal" | "web" | "telegram" | "avito" | "email" | "api";
		isInternal: boolean;
	};
	"support:ticket-assigned": {
		ticketId: string;
		assignedToUserId: string | null;
	};
	"support:ticket-created": {
		ticketId: string;
		source: "manual" | "web" | "telegram" | "avito" | "email" | "api";
		customerUserId: string | null;
	};
	"support:ticket-status-changed": {
		ticketId: string;
		previousStatus:
			| "open"
			| "pending_customer"
			| "pending_operator"
			| "escalated"
			| "resolved"
			| "closed";
		status:
			| "open"
			| "pending_customer"
			| "pending_operator"
			| "escalated"
			| "resolved"
			| "closed";
	};
}

export type DomainEventType = keyof DomainEventMap;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
	actorUserId?: string;
	data: DomainEventMap[T];
	idempotencyKey: string;
	organizationId: string;
	type: T;
}
