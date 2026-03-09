export interface DomainEventMap {
	"booking:created": { bookingId: string; listingId: string; customerId: string };
	"booking:confirmed": { bookingId: string; ownerId: string };
	"booking:cancelled": { bookingId: string; reason: string; refundAmountKopeks: number };
	"booking:contact-updated": { bookingId: string; contactDetails: Record<string, unknown> };
	"payment:captured": { bookingId: string; paymentId: string; amountKopeks: number };
	"payment:failed": { bookingId: string; paymentId: string; error: string };
	"dispute:opened": { disputeId: string; bookingId: string };
	"dispute:resolved": { disputeId: string; resolution: string };
	"calendar:sync-requested": { bookingId: string; calendarId: string };
}

export type DomainEventType = keyof DomainEventMap;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
	type: T;
	organizationId: string;
	actorUserId?: string;
	idempotencyKey: string;
	data: DomainEventMap[T];
}
