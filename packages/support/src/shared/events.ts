import type {
	InboundMessageChannel,
	SupportActorContext,
	SupportTicketMessageRow,
	SupportTicketRow,
	SupportTicketStatus,
} from "./types";

const emitWithContext = async (
	actorContext: SupportActorContext | undefined,
	input: Parameters<SupportActorContext["eventBus"]["emit"]>[0]
): Promise<void> => {
	if (!actorContext) {
		return;
	}

	await actorContext.eventBus.emit(input);
};

export const emitSupportTicketCreated = async (
	actorContext: SupportActorContext | undefined,
	ticket: SupportTicketRow
): Promise<void> =>
	emitWithContext(actorContext, {
		type: "support:ticket-created",
		organizationId: ticket.organizationId,
		actorUserId: actorContext?.actorUserId,
		idempotencyKey: `support:ticket-created:${ticket.id}`,
		data: {
			ticketId: ticket.id,
			source: ticket.source,
			customerUserId: ticket.customerUserId,
		},
	});

export const emitSupportTicketAssigned = async (
	actorContext: SupportActorContext | undefined,
	ticket: SupportTicketRow
): Promise<void> =>
	emitWithContext(actorContext, {
		type: "support:ticket-assigned",
		organizationId: ticket.organizationId,
		actorUserId: actorContext?.actorUserId,
		idempotencyKey: `support:ticket-assigned:${ticket.id}:${ticket.assignedToUserId ?? "unassigned"}`,
		data: {
			ticketId: ticket.id,
			assignedToUserId: ticket.assignedToUserId,
		},
	});

export const emitSupportTicketStatusChanged = async (
	actorContext: SupportActorContext | undefined,
	input: {
		organizationId: string;
		previousStatus: SupportTicketStatus;
		status: SupportTicketStatus;
		ticketId: string;
	}
): Promise<void> =>
	emitWithContext(actorContext, {
		type: "support:ticket-status-changed",
		organizationId: input.organizationId,
		actorUserId: actorContext?.actorUserId,
		idempotencyKey: `support:ticket-status-changed:${input.ticketId}:${input.status}`,
		data: {
			ticketId: input.ticketId,
			previousStatus: input.previousStatus,
			status: input.status,
		},
	});

export const emitSupportMessageAdded = async (
	actorContext: SupportActorContext | undefined,
	input: {
		message: SupportTicketMessageRow;
		organizationId: string;
	}
): Promise<void> =>
	emitWithContext(actorContext, {
		type: "support:message-added",
		organizationId: input.organizationId,
		actorUserId: actorContext?.actorUserId,
		idempotencyKey: `support:message-added:${input.message.id}`,
		data: {
			ticketId: input.message.ticketId,
			messageId: input.message.id,
			channel: input.message.channel,
			isInternal: input.message.isInternal,
		},
	});

export const emitSupportInboundReceived = async (
	actorContext: SupportActorContext | undefined,
	input: {
		channel: InboundMessageChannel;
		inboundMessageId: string;
		organizationId: string;
	}
): Promise<void> =>
	emitWithContext(actorContext, {
		type: "support:inbound-received",
		organizationId: input.organizationId,
		actorUserId: actorContext?.actorUserId,
		idempotencyKey: `support:inbound-received:${input.inboundMessageId}`,
		data: {
			inboundMessageId: input.inboundMessageId,
			channel: input.channel,
		},
	});

export const emitSupportInboundProcessed = async (
	actorContext: SupportActorContext | undefined,
	input: {
		channel: InboundMessageChannel;
		inboundMessageId: string;
		messageId: string;
		organizationId: string;
		ticketId: string;
	}
): Promise<void> =>
	emitWithContext(actorContext, {
		type: "support:inbound-processed",
		organizationId: input.organizationId,
		actorUserId: actorContext?.actorUserId,
		idempotencyKey: `support:inbound-processed:${input.inboundMessageId}`,
		data: {
			inboundMessageId: input.inboundMessageId,
			messageId: input.messageId,
			ticketId: input.ticketId,
			channel: input.channel,
		},
	});
