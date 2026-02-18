import { db } from "@full-stack-cf-app/db";
import type {
	InboundMessageChannel,
	SupportMessageChannel,
} from "@full-stack-cf-app/db/schema/support";
import { inboundMessage } from "@full-stack-cf-app/db/schema/support";
import { and, desc, eq } from "drizzle-orm";
import type {
	ChannelMeta,
	ChannelRegistry,
	OutboundDeliveryResult,
} from "./types";

// ─── Metadata / Inbound resolution ────────────────────────────────────

export const parseTicketMetadata = (
	metadata: string | null
): ChannelMeta | null => {
	if (!metadata) {
		return null;
	}
	try {
		const parsed = JSON.parse(metadata) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as ChannelMeta;
		}
		return null;
	} catch {
		return null;
	}
};

export const resolveLatestInboundForChannel = async (params: {
	ticketId: string;
	channel: InboundMessageChannel;
}) => {
	const [latest] = await db
		.select({
			externalThreadId: inboundMessage.externalThreadId,
			externalSenderId: inboundMessage.externalSenderId,
		})
		.from(inboundMessage)
		.where(
			and(
				eq(inboundMessage.ticketId, params.ticketId),
				eq(inboundMessage.channel, params.channel)
			)
		)
		.orderBy(desc(inboundMessage.receivedAt))
		.limit(1);

	return latest ?? null;
};

// ─── Dispatch ──────────────────────────────────────────────────────────

export interface DispatchOutboundReplyParams {
	organizationId: string;
	requestedByUserId: string;
	ticket: {
		id: string;
		metadata: string | null;
	};
	message: {
		id: string;
		channel: SupportMessageChannel;
		body: string;
	};
}

export interface DispatchResult {
	dispatched: boolean;
	channel: SupportMessageChannel;
	recipientId?: string;
	result?: OutboundDeliveryResult;
}

export const dispatchOutboundReply = async (
	registry: ChannelRegistry,
	params: DispatchOutboundReplyParams
): Promise<DispatchResult> => {
	const channel = params.message.channel;

	if (channel === "internal") {
		return { dispatched: false, channel };
	}

	const adapter = registry.getOutboundAdapter(channel);

	if (!adapter) {
		return { dispatched: false, channel };
	}

	const ticketMetadata = parseTicketMetadata(params.ticket.metadata);
	const latestInbound = await resolveLatestInboundForChannel({
		ticketId: params.ticket.id,
		channel,
	});

	const recipientId = adapter.resolveRecipientId({
		ticketMetadata,
		latestInbound,
	});

	if (!recipientId) {
		return { dispatched: false, channel };
	}

	const result = await adapter.send({
		organizationId: params.organizationId,
		ticketId: params.ticket.id,
		messageId: params.message.id,
		channel,
		body: params.message.body,
		recipientId,
		requestedByUserId: params.requestedByUserId,
	});

	return {
		dispatched: true,
		channel,
		recipientId,
		result,
	};
};
