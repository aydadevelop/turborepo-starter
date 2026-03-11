import type {
	InboundMessageChannel,
	SupportAttachment,
	SupportMessageChannel,
} from "../shared/types";

export interface InboundSupportIntent {
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

export interface OutboundSupportIntent {
	attachments?: SupportAttachment[];
	body: string;
	channel: Exclude<SupportMessageChannel, "internal">;
	externalRecipientId?: string;
	externalThreadId?: string;
	messageId: string;
	metadata?: Record<string, unknown>;
	organizationId: string;
	ticketId: string;
}
