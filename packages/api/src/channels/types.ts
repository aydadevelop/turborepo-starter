/**
 * Channel adapter abstraction for multi-channel helpdesk communications.
 *
 * Inbound adapters normalize provider-specific messages into the internal format.
 * Outbound adapters dispatch replies back through the originating channel.
 */

import type { SupportMessageChannel } from "@full-stack-cf-app/db/schema/support";

// ─── Channel Metadata ──────────────────────────────────────────────────

/** Well-known metadata keys per channel — used for recipient resolution. */
export interface TelegramChannelMeta {
	telegramChatId?: string;
	chatId?: string;
	telegram?: { chatId?: string; recipientChatId?: string };
}

export interface EmailChannelMeta {
	replyToEmail?: string;
	senderEmail?: string;
	subject?: string;
}

export interface WebChannelMeta {
	userId?: string;
	customerUserId?: string;
}

export interface AvitoChannelMeta {
	avitoChatId?: string;
}

export interface SputnikChannelMeta {
	replyToEmail?: string;
	senderEmail?: string;
	bookingRef?: string;
}

/**
 * Union of all channel-specific metadata shapes.
 * Ticket metadata may contain keys from any channel (merged at ingest).
 */
export type ChannelMeta = TelegramChannelMeta &
	EmailChannelMeta &
	WebChannelMeta &
	AvitoChannelMeta &
	SputnikChannelMeta &
	Record<string, unknown>;

// ─── Inbound ───────────────────────────────────────────────────────────

export interface NormalizedInboundMessage {
	channel: SupportMessageChannel;
	externalMessageId: string;
	externalThreadId?: string;
	externalSenderId?: string;
	senderDisplayName?: string;
	text?: string;
	payload: string;
	ticketId?: string;
	dedupeKey?: string;
	metadata?: ChannelMeta;
}

export interface InboundChannelAdapter {
	readonly channel: SupportMessageChannel;
	readonly name: string;
	normalize(rawPayload: unknown): NormalizedInboundMessage;
}

// ─── Outbound ──────────────────────────────────────────────────────────

export interface OutboundMessageParams {
	organizationId: string;
	ticketId: string;
	messageId: string;
	channel: SupportMessageChannel;
	body: string;
	recipientId: string;
	requestedByUserId?: string;
	metadata?: ChannelMeta;
}

export interface OutboundDeliveryResult {
	status: "sent" | "queued" | "failed";
	providerMessageId?: string;
	failureReason?: string;
	responsePayload?: string;
}

export interface LatestInboundRef {
	externalThreadId?: string | null;
	externalSenderId?: string | null;
}

export interface OutboundChannelAdapter {
	readonly channel: SupportMessageChannel;
	readonly name: string;
	send(params: OutboundMessageParams): Promise<OutboundDeliveryResult>;
	resolveRecipientId(params: {
		ticketMetadata?: ChannelMeta | null;
		latestInbound?: LatestInboundRef | null;
	}): string | null;
}

// ─── Registry ──────────────────────────────────────────────────────────

export interface ChannelRegistry {
	getOutboundAdapter(
		channel: SupportMessageChannel
	): OutboundChannelAdapter | null;
	getInboundAdapter(
		channel: SupportMessageChannel
	): InboundChannelAdapter | null;
	listOutboundChannels(): SupportMessageChannel[];
	listInboundChannels(): SupportMessageChannel[];
}

// ─── AI First-Line ─────────────────────────────────────────────────────

export interface FirstLineResponse {
	shouldAutoReply: boolean;
	suggestedReply?: string;
	confidence: number;
	tags?: string[];
	priority?: string;
}

export interface FirstLineResponder {
	analyze(params: {
		organizationId: string;
		ticketId: string;
		channel: SupportMessageChannel;
		inboundText: string;
		ticketSubject: string;
		ticketHistory?: Array<{ body: string; isInternal: boolean }>;
	}): Promise<FirstLineResponse>;
}
