import type {
	ChannelMeta,
	InboundChannelAdapter,
	LatestInboundRef,
	NormalizedInboundMessage,
	OutboundChannelAdapter,
	OutboundDeliveryResult,
	OutboundMessageParams,
} from "./types";

// ─── Shared ────────────────────────────────────────────────────────────

const pickFirstNonEmpty = (...values: unknown[]): string | null => {
	for (const value of values) {
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
};

// ─── Telegram ──────────────────────────────────────────────────────────

/**
 * Queue-based delivery strategy for TelegramOutboundAdapter.
 * When provided, the adapter writes a notification record to the DB
 * and enqueues it for async processing instead of calling the API directly.
 */
export interface TelegramQueueStrategy {
	enqueue(params: {
		organizationId: string;
		ticketId: string;
		messageId: string;
		recipientChatId: string;
		requestedByUserId?: string;
		body: string;
		channel: string;
	}): Promise<{ notificationId: string }>;
}

export interface TelegramOutboundConfig {
	botToken?: string;
	apiBaseUrl?: string;
	/** When set, prefer async queue delivery over direct HTTP. */
	queueStrategy?: TelegramQueueStrategy;
}

export class TelegramOutboundAdapter implements OutboundChannelAdapter {
	readonly channel = "telegram" as const;
	readonly name = "telegram";
	private readonly config: TelegramOutboundConfig;

	constructor(config: TelegramOutboundConfig = {}) {
		this.config = config;
	}

	resolveRecipientId(params: {
		ticketMetadata?: ChannelMeta | null;
		latestInbound?: LatestInboundRef | null;
	}): string | null {
		const meta = params.ticketMetadata;
		const telegram = meta?.telegram;

		const fromMeta = pickFirstNonEmpty(
			meta?.telegramChatId,
			meta?.chatId,
			telegram?.chatId,
			telegram?.recipientChatId
		);
		if (fromMeta) {
			return fromMeta;
		}

		return pickFirstNonEmpty(
			params.latestInbound?.externalThreadId,
			params.latestInbound?.externalSenderId
		);
	}

	async send(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
		// Prefer queue strategy for async delivery (production path)
		if (this.config.queueStrategy) {
			try {
				const { notificationId } = await this.config.queueStrategy.enqueue({
					organizationId: params.organizationId,
					ticketId: params.ticketId,
					messageId: params.messageId,
					recipientChatId: params.recipientId,
					requestedByUserId: params.requestedByUserId,
					body: params.body,
					channel: params.channel,
				});
				return {
					status: "queued",
					providerMessageId: notificationId,
				};
			} catch (error) {
				return {
					status: "failed",
					failureReason:
						error instanceof Error
							? error.message
							: "Telegram queue enqueue failed",
				};
			}
		}

		// Direct HTTP send (dev/test or when queue is unavailable)
		const botToken = this.config.botToken;
		if (!botToken) {
			return {
				status: "failed",
				failureReason:
					"Telegram delivery not configured (no bot token or queue strategy)",
			};
		}

		const apiBase = this.config.apiBaseUrl || "https://api.telegram.org";

		try {
			const response = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					chat_id: params.recipientId,
					text: params.body.slice(0, 4000),
				}),
			});

			const responseText = await response.text();
			if (!response.ok) {
				return {
					status: "failed",
					failureReason: `Telegram API HTTP ${response.status}`,
					responsePayload: responseText.slice(0, 4000),
				};
			}

			let providerMessageId = `telegram-${params.messageId}`;
			try {
				const parsed = JSON.parse(responseText) as {
					ok?: boolean;
					description?: string;
					result?: { message_id?: number | string };
				};
				if (!parsed.ok) {
					return {
						status: "failed",
						failureReason:
							parsed.description || "Telegram API rejected message",
						responsePayload: responseText.slice(0, 4000),
					};
				}
				providerMessageId = String(
					parsed.result?.message_id ?? providerMessageId
				);
			} catch {
				// keep fallback providerMessageId
			}

			return {
				status: "sent",
				providerMessageId,
				responsePayload: responseText.slice(0, 4000),
			};
		} catch (error) {
			return {
				status: "failed",
				failureReason:
					error instanceof Error ? error.message : "Telegram send failed",
			};
		}
	}
}

export class TelegramInboundAdapter implements InboundChannelAdapter {
	readonly channel = "telegram" as const;
	readonly name = "telegram";

	normalize(rawPayload: unknown): NormalizedInboundMessage {
		const payload =
			typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);

		const parsed =
			typeof rawPayload === "object" && rawPayload !== null
				? (rawPayload as Record<string, unknown>)
				: {};

		const message = (parsed.message ?? parsed) as Record<string, unknown>;
		const chat = message.chat as Record<string, unknown> | undefined;
		const from = message.from as Record<string, unknown> | undefined;

		const text = typeof message.text === "string" ? message.text : undefined;
		const chatId = chat?.id != null ? String(chat.id) : undefined;
		const messageId =
			message.message_id != null
				? String(message.message_id)
				: crypto.randomUUID();
		const senderId = from?.id != null ? String(from.id) : undefined;
		const senderName =
			pickFirstNonEmpty(from?.first_name, from?.username) ?? undefined;

		return {
			channel: "telegram",
			externalMessageId: messageId,
			externalThreadId: chatId,
			externalSenderId: senderId,
			senderDisplayName: senderName,
			text,
			payload,
			metadata: {
				telegramChatId: chatId,
			},
		};
	}
}

// ─── Email ─────────────────────────────────────────────────────────────

export class EmailOutboundAdapter implements OutboundChannelAdapter {
	readonly channel = "email" as const;
	readonly name = "email";

	resolveRecipientId(params: {
		ticketMetadata?: ChannelMeta | null;
		latestInbound?: LatestInboundRef | null;
	}): string | null {
		return pickFirstNonEmpty(
			params.ticketMetadata?.replyToEmail,
			params.ticketMetadata?.senderEmail,
			params.latestInbound?.externalSenderId
		);
	}

	send(): Promise<OutboundDeliveryResult> {
		// Email sending will be implemented with a real provider (e.g. Resend, SES)
		return Promise.resolve({
			status: "failed",
			failureReason: "Email provider not yet configured",
		});
	}
}

export class EmailInboundAdapter implements InboundChannelAdapter {
	readonly channel = "email" as const;
	readonly name = "email";

	normalize(rawPayload: unknown): NormalizedInboundMessage {
		const payload =
			typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);

		const parsed =
			typeof rawPayload === "object" && rawPayload !== null
				? (rawPayload as Record<string, unknown>)
				: {};

		const messageId =
			typeof parsed.messageId === "string"
				? parsed.messageId
				: crypto.randomUUID();
		const from = typeof parsed.from === "string" ? parsed.from : undefined;
		const subject =
			typeof parsed.subject === "string" ? parsed.subject : undefined;
		const body = typeof parsed.text === "string" ? parsed.text : undefined;
		const threadId =
			typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined;

		return {
			channel: "email",
			externalMessageId: messageId,
			externalThreadId: threadId,
			externalSenderId: from,
			senderDisplayName: from,
			text: body ?? subject,
			payload,
			metadata: {
				senderEmail: from,
				subject,
			},
		};
	}
}

// ─── Web (site chat / forms) ───────────────────────────────────────────

export class WebOutboundAdapter implements OutboundChannelAdapter {
	readonly channel = "web" as const;
	readonly name = "web";

	resolveRecipientId(params: {
		ticketMetadata?: ChannelMeta | null;
		latestInbound?: LatestInboundRef | null;
	}): string | null {
		return pickFirstNonEmpty(
			params.ticketMetadata?.userId,
			params.ticketMetadata?.customerUserId,
			params.latestInbound?.externalSenderId
		);
	}

	send(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
		// Web channel replies are visible in the ticket thread — delivery is implicit
		return Promise.resolve({
			status: "sent",
			providerMessageId: `web-${params.messageId}`,
		});
	}
}

export class WebInboundAdapter implements InboundChannelAdapter {
	readonly channel = "web" as const;
	readonly name = "web";

	normalize(rawPayload: unknown): NormalizedInboundMessage {
		const payload =
			typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);

		const parsed =
			typeof rawPayload === "object" && rawPayload !== null
				? (rawPayload as Record<string, unknown>)
				: {};

		return {
			channel: "web",
			externalMessageId:
				typeof parsed.messageId === "string"
					? parsed.messageId
					: crypto.randomUUID(),
			externalSenderId:
				typeof parsed.userId === "string" ? parsed.userId : undefined,
			senderDisplayName:
				typeof parsed.userName === "string" ? parsed.userName : undefined,
			text: typeof parsed.text === "string" ? parsed.text : undefined,
			payload,
		};
	}
}

// ─── Avito ─────────────────────────────────────────────────────────────

export class AvitoOutboundAdapter implements OutboundChannelAdapter {
	readonly channel = "avito" as const;
	readonly name = "avito";

	resolveRecipientId(params: {
		ticketMetadata?: ChannelMeta | null;
		latestInbound?: LatestInboundRef | null;
	}): string | null {
		return pickFirstNonEmpty(
			params.ticketMetadata?.avitoChatId,
			params.latestInbound?.externalThreadId,
			params.latestInbound?.externalSenderId
		);
	}

	send(): Promise<OutboundDeliveryResult> {
		// Avito API integration to be configured
		return Promise.resolve({
			status: "failed",
			failureReason: "Avito provider not yet configured",
		});
	}
}

export class AvitoInboundAdapter implements InboundChannelAdapter {
	readonly channel = "avito" as const;
	readonly name = "avito";

	normalize(rawPayload: unknown): NormalizedInboundMessage {
		const payload =
			typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);

		const parsed =
			typeof rawPayload === "object" && rawPayload !== null
				? (rawPayload as Record<string, unknown>)
				: {};

		return {
			channel: "avito",
			externalMessageId:
				typeof parsed.id === "string" ? parsed.id : crypto.randomUUID(),
			externalThreadId:
				typeof parsed.chatId === "string" ? parsed.chatId : undefined,
			externalSenderId:
				typeof parsed.userId === "string" ? parsed.userId : undefined,
			senderDisplayName:
				typeof parsed.userName === "string" ? parsed.userName : undefined,
			text: typeof parsed.text === "string" ? parsed.text : undefined,
			payload,
			metadata: {
				avitoChatId:
					typeof parsed.chatId === "string" ? parsed.chatId : undefined,
			},
		};
	}
}

// ─── Sputnik ───────────────────────────────────────────────────────────

export class SputnikOutboundAdapter implements OutboundChannelAdapter {
	readonly channel = "sputnik" as const;
	readonly name = "sputnik";

	resolveRecipientId(params: {
		ticketMetadata?: ChannelMeta | null;
		latestInbound?: LatestInboundRef | null;
	}): string | null {
		return pickFirstNonEmpty(
			params.ticketMetadata?.replyToEmail,
			params.ticketMetadata?.senderEmail,
			params.latestInbound?.externalSenderId
		);
	}

	send(): Promise<OutboundDeliveryResult> {
		// Sputnik replies go via email forwarding
		return Promise.resolve({
			status: "failed",
			failureReason: "Sputnik email forwarding not yet configured",
		});
	}
}

export class SputnikInboundAdapter implements InboundChannelAdapter {
	readonly channel = "sputnik" as const;
	readonly name = "sputnik";

	normalize(rawPayload: unknown): NormalizedInboundMessage {
		const payload =
			typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);

		const parsed =
			typeof rawPayload === "object" && rawPayload !== null
				? (rawPayload as Record<string, unknown>)
				: {};

		return {
			channel: "sputnik",
			externalMessageId:
				typeof parsed.messageId === "string"
					? parsed.messageId
					: crypto.randomUUID(),
			externalThreadId:
				typeof parsed.bookingRef === "string" ? parsed.bookingRef : undefined,
			externalSenderId:
				typeof parsed.from === "string" ? parsed.from : undefined,
			senderDisplayName:
				typeof parsed.guestName === "string" ? parsed.guestName : undefined,
			text: typeof parsed.text === "string" ? parsed.text : undefined,
			payload,
			metadata: {
				senderEmail: typeof parsed.from === "string" ? parsed.from : undefined,
				bookingRef:
					typeof parsed.bookingRef === "string" ? parsed.bookingRef : undefined,
			},
		};
	}
}
