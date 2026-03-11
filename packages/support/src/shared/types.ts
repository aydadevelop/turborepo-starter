import type { db } from "@my-app/db";
import type {
	inboundMessage,
	inboundMessageChannelValues,
	inboundMessageStatusValues,
	supportMessageChannelValues,
	supportTicket,
	supportTicketMessage,
	supportTicketPriorityValues,
	supportTicketSourceValues,
	supportTicketStatusValues,
} from "@my-app/db/schema/support";
import type { EventBus } from "@my-app/events";

export type Db = typeof db;
export type SupportTicketRow = typeof supportTicket.$inferSelect;
export type SupportTicketInsert = typeof supportTicket.$inferInsert;
export type SupportTicketMessageRow = typeof supportTicketMessage.$inferSelect;
export type SupportTicketMessageInsert =
	typeof supportTicketMessage.$inferInsert;
export type InboundMessageRow = typeof inboundMessage.$inferSelect;
export type InboundMessageInsert = typeof inboundMessage.$inferInsert;

export type SupportTicketStatus = (typeof supportTicketStatusValues)[number];
export type SupportTicketPriority =
	(typeof supportTicketPriorityValues)[number];
export type SupportTicketSource = (typeof supportTicketSourceValues)[number];
export type SupportMessageChannel =
	(typeof supportMessageChannelValues)[number];
export type InboundMessageChannel =
	(typeof inboundMessageChannelValues)[number];
export type InboundMessageStatus = (typeof inboundMessageStatusValues)[number];

export interface SupportAttachment {
	mimeType?: string;
	name: string;
	url: string;
}

export interface SupportActorContext {
	actorUserId?: string;
	eventBus: EventBus;
}

export interface CreateSupportTicketInput {
	bookingId?: string;
	createdByUserId?: string;
	customerUserId?: string;
	description?: string;
	metadata?: Record<string, unknown>;
	organizationId: string;
	priority?: SupportTicketPriority;
	source?: SupportTicketSource;
	subject: string;
}

export interface AddTicketMessageInput {
	attachments?: SupportAttachment[];
	authorUserId?: string;
	body: string;
	channel?: SupportMessageChannel;
	inboundMessageId?: string;
	isInternal?: boolean;
	organizationId: string;
	ticketId: string;
}

export interface AddCustomerTicketMessageInput {
	attachments?: SupportAttachment[];
	authorUserId?: string;
	body: string;
	customerUserId: string;
	ticketId: string;
}

export interface AssignTicketInput {
	assignedToUserId: string | null;
	organizationId: string;
	ticketId: string;
}

export interface UpdateTicketStatusInput {
	organizationId: string;
	status: SupportTicketStatus;
	ticketId: string;
}

export interface UpdateTicketPriorityInput {
	organizationId: string;
	priority: SupportTicketPriority;
	ticketId: string;
}

export interface UpdateTicketDueAtInput {
	dueAt: Date | null;
	organizationId: string;
	ticketId: string;
}

export interface ListOrgTicketsFilter {
	assignedToUserId?: string;
	bookingId?: string;
	customerUserId?: string;
	limit?: number;
	offset?: number;
	onlyOverdue?: boolean;
	onlyUnassigned?: boolean;
	priority?: SupportTicketPriority;
	source?: SupportTicketSource;
	status?: SupportTicketStatus;
}

export interface ListCustomerTicketsFilter {
	bookingId?: string;
	limit?: number;
	offset?: number;
}

export interface OperatorTicketThread {
	messages: SupportTicketMessageRow[];
	ticket: SupportTicketRow;
}

export interface CustomerTicketThread {
	messages: SupportTicketMessageRow[];
	ticket: SupportTicketRow;
}

export interface ProcessInboundSupportIntentInput {
	attachments?: SupportAttachment[];
	channel: InboundMessageChannel;
	createdByUserId?: string;
	customerUserId?: string;
	dedupeKey: string;
	defaultDescription?: string;
	defaultSubject?: string;
	externalMessageId: string;
	externalSenderId?: string;
	externalThreadId?: string;
	normalizedText?: string;
	organizationId: string;
	payload: Record<string, unknown>;
	senderDisplayName?: string;
	ticketId?: string;
}

export interface ProcessInboundSupportIntentOutput {
	inbound: InboundMessageRow;
	message: SupportTicketMessageRow;
	ticket: SupportTicketRow;
}
