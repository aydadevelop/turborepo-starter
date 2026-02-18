import { describe, expect, it } from "vitest";

import {
	AvitoInboundAdapter,
	AvitoOutboundAdapter,
	EmailInboundAdapter,
	EmailOutboundAdapter,
	SputnikInboundAdapter,
	SputnikOutboundAdapter,
	TelegramInboundAdapter,
	TelegramOutboundAdapter,
	WebInboundAdapter,
	WebOutboundAdapter,
} from "../channels/adapters";
import { ChannelAdapterRegistry } from "../channels/registry";
import type {
	InboundChannelAdapter,
	OutboundChannelAdapter,
} from "../channels/types";

// ─── Registry ──────────────────────────────────────────────────────────

describe("ChannelAdapterRegistry", () => {
	it("registers and retrieves outbound adapters", () => {
		const registry = new ChannelAdapterRegistry();
		const telegram = new TelegramOutboundAdapter();
		registry.registerOutbound(telegram);

		expect(registry.getOutboundAdapter("telegram")).toBe(telegram);
		expect(registry.getOutboundAdapter("email")).toBeNull();
	});

	it("registers and retrieves inbound adapters", () => {
		const registry = new ChannelAdapterRegistry();
		const email = new EmailInboundAdapter();
		registry.registerInbound(email);

		expect(registry.getInboundAdapter("email")).toBe(email);
		expect(registry.getInboundAdapter("telegram")).toBeNull();
	});

	it("lists registered channels", () => {
		const registry = new ChannelAdapterRegistry();
		registry.registerOutbound(new TelegramOutboundAdapter());
		registry.registerOutbound(new EmailOutboundAdapter());
		registry.registerInbound(new WebInboundAdapter());

		expect(registry.listOutboundChannels()).toEqual(
			expect.arrayContaining(["telegram", "email"])
		);
		expect(registry.listInboundChannels()).toEqual(["web"]);
	});

	it("replaces adapter on re-registration for same channel", () => {
		const registry = new ChannelAdapterRegistry();
		const first = new TelegramOutboundAdapter();
		const second = new TelegramOutboundAdapter({ botToken: "new-token" });

		registry.registerOutbound(first);
		registry.registerOutbound(second);

		expect(registry.getOutboundAdapter("telegram")).toBe(second);
		expect(registry.listOutboundChannels()).toHaveLength(1);
	});
});

// ─── Telegram Inbound ──────────────────────────────────────────────────

describe("TelegramInboundAdapter", () => {
	const adapter = new TelegramInboundAdapter();

	it("has correct channel and name", () => {
		expect(adapter.channel).toBe("telegram");
		expect(adapter.name).toBe("telegram");
	});

	it("normalizes a standard Telegram message payload", () => {
		const raw = {
			message: {
				message_id: 42,
				chat: { id: 123_456, type: "private" },
				from: { id: 789, first_name: "Ivan", username: "ivan_test" },
				text: "Hello, I need help with my booking",
			},
		};

		const result = adapter.normalize(raw);

		expect(result.channel).toBe("telegram");
		expect(result.externalMessageId).toBe("42");
		expect(result.externalThreadId).toBe("123456");
		expect(result.externalSenderId).toBe("789");
		expect(result.senderDisplayName).toBe("Ivan");
		expect(result.text).toBe("Hello, I need help with my booking");
		expect(result.metadata?.telegramChatId).toBe("123456");
	});

	it("handles string payload", () => {
		const raw = JSON.stringify({
			message: {
				message_id: 1,
				chat: { id: 100 },
				from: { id: 200, first_name: "Test" },
				text: "Test message",
			},
		});

		const result = adapter.normalize(raw);
		expect(result.channel).toBe("telegram");
		expect(result.text).toBeUndefined(); // string payload parsed differently
		expect(result.payload).toBe(raw);
	});

	it("handles missing fields gracefully", () => {
		const raw = { message: {} };
		const result = adapter.normalize(raw);

		expect(result.channel).toBe("telegram");
		expect(result.externalMessageId).toBeDefined();
		expect(result.text).toBeUndefined();
	});
});

// ─── Telegram Outbound ─────────────────────────────────────────────────

describe("TelegramOutboundAdapter", () => {
	const adapter = new TelegramOutboundAdapter();

	it("has correct channel and name", () => {
		expect(adapter.channel).toBe("telegram");
		expect(adapter.name).toBe("telegram");
	});

	it("resolves recipient from ticket metadata telegramChatId", () => {
		const recipientId = adapter.resolveRecipientId({
			ticketMetadata: { telegramChatId: "12345" },
		});
		expect(recipientId).toBe("12345");
	});

	it("resolves recipient from nested telegram.chatId metadata", () => {
		const recipientId = adapter.resolveRecipientId({
			ticketMetadata: { telegram: { chatId: "67890" } },
		});
		expect(recipientId).toBe("67890");
	});

	it("falls back to latest inbound externalThreadId", () => {
		const recipientId = adapter.resolveRecipientId({
			ticketMetadata: {},
			latestInbound: { externalThreadId: "thread-123", externalSenderId: null },
		});
		expect(recipientId).toBe("thread-123");
	});

	it("falls back to latest inbound externalSenderId", () => {
		const recipientId = adapter.resolveRecipientId({
			latestInbound: { externalThreadId: null, externalSenderId: "sender-456" },
		});
		expect(recipientId).toBe("sender-456");
	});

	it("returns null when no recipient found", () => {
		expect(adapter.resolveRecipientId({})).toBeNull();
		expect(adapter.resolveRecipientId({ ticketMetadata: {} })).toBeNull();
	});

	it("fails send without bot token or queue strategy", async () => {
		const result = await adapter.send({
			organizationId: "org-1",
			ticketId: "t-1",
			messageId: "m-1",
			channel: "telegram",
			body: "Test reply",
			recipientId: "12345",
		});

		expect(result.status).toBe("failed");
		expect(result.failureReason).toContain("not configured");
	});

	it("queues via strategy when queueStrategy is provided", async () => {
		const enqueuedParams: unknown[] = [];
		const queuedAdapter = new TelegramOutboundAdapter({
			queueStrategy: {
				enqueue: (params) => {
					enqueuedParams.push(params);
					return Promise.resolve({ notificationId: "notif-123" });
				},
			},
		});

		const result = await queuedAdapter.send({
			organizationId: "org-1",
			ticketId: "t-1",
			messageId: "m-1",
			channel: "telegram",
			body: "Queued reply",
			recipientId: "12345",
			requestedByUserId: "user-1",
		});

		expect(result.status).toBe("queued");
		expect(result.providerMessageId).toBe("notif-123");
		expect(enqueuedParams).toHaveLength(1);
	});
});

// ─── Email ─────────────────────────────────────────────────────────────

describe("EmailInboundAdapter", () => {
	const adapter = new EmailInboundAdapter();

	it("normalizes email payload", () => {
		const raw = {
			messageId: "msg-001@example.com",
			from: "guest@example.com",
			subject: "Booking question",
			text: "Can I change the date?",
			inReplyTo: "msg-000@example.com",
		};

		const result = adapter.normalize(raw);

		expect(result.channel).toBe("email");
		expect(result.externalMessageId).toBe("msg-001@example.com");
		expect(result.externalThreadId).toBe("msg-000@example.com");
		expect(result.externalSenderId).toBe("guest@example.com");
		expect(result.text).toBe("Can I change the date?");
		expect(result.metadata?.senderEmail).toBe("guest@example.com");
	});
});

describe("EmailOutboundAdapter", () => {
	const adapter = new EmailOutboundAdapter();

	it("resolves recipient from metadata", () => {
		expect(
			adapter.resolveRecipientId({
				ticketMetadata: { replyToEmail: "test@example.com" },
			})
		).toBe("test@example.com");
	});

	it("falls back to inbound sender", () => {
		expect(
			adapter.resolveRecipientId({
				latestInbound: {
					externalThreadId: null,
					externalSenderId: "sender@example.com",
				},
			})
		).toBe("sender@example.com");
	});
});

// ─── Web ───────────────────────────────────────────────────────────────

describe("WebOutboundAdapter", () => {
	const adapter = new WebOutboundAdapter();

	it("sends successfully (implicit delivery)", async () => {
		const result = await adapter.send({
			organizationId: "org-1",
			ticketId: "t-1",
			messageId: "m-1",
			channel: "web",
			body: "Reply text",
			recipientId: "user-1",
		});

		expect(result.status).toBe("sent");
		expect(result.providerMessageId).toContain("web-");
	});

	it("resolves recipient from userId metadata", () => {
		expect(
			adapter.resolveRecipientId({
				ticketMetadata: { userId: "user-abc" },
			})
		).toBe("user-abc");
	});
});

describe("WebInboundAdapter", () => {
	const adapter = new WebInboundAdapter();

	it("normalizes web payload", () => {
		const raw = {
			messageId: "web-msg-1",
			userId: "user-123",
			userName: "Alice",
			text: "I want to cancel my booking",
		};

		const result = adapter.normalize(raw);

		expect(result.channel).toBe("web");
		expect(result.externalMessageId).toBe("web-msg-1");
		expect(result.externalSenderId).toBe("user-123");
		expect(result.senderDisplayName).toBe("Alice");
		expect(result.text).toBe("I want to cancel my booking");
	});
});

// ─── Avito ─────────────────────────────────────────────────────────────

describe("AvitoInboundAdapter", () => {
	const adapter = new AvitoInboundAdapter();

	it("normalizes Avito payload", () => {
		const raw = {
			id: "avito-msg-42",
			chatId: "avito-chat-1",
			userId: "avito-user-1",
			userName: "Buyer",
			text: "Is this boat still available?",
		};

		const result = adapter.normalize(raw);

		expect(result.channel).toBe("avito");
		expect(result.externalMessageId).toBe("avito-msg-42");
		expect(result.externalThreadId).toBe("avito-chat-1");
		expect(result.metadata?.avitoChatId).toBe("avito-chat-1");
		expect(result.text).toBe("Is this boat still available?");
	});
});

describe("AvitoOutboundAdapter", () => {
	const adapter = new AvitoOutboundAdapter();

	it("resolves recipient from avitoChatId metadata", () => {
		expect(
			adapter.resolveRecipientId({
				ticketMetadata: { avitoChatId: "chat-avito-1" },
			})
		).toBe("chat-avito-1");
	});
});

// ─── Sputnik ───────────────────────────────────────────────────────────

describe("SputnikInboundAdapter", () => {
	const adapter = new SputnikInboundAdapter();

	it("normalizes Sputnik email payload", () => {
		const raw = {
			messageId: "sputnik-msg-1",
			from: "noreply@sputnik.ru",
			bookingRef: "SPT-2025-001",
			guestName: "Sergey",
			text: "Need to change dates",
		};

		const result = adapter.normalize(raw);

		expect(result.channel).toBe("sputnik");
		expect(result.externalMessageId).toBe("sputnik-msg-1");
		expect(result.externalThreadId).toBe("SPT-2025-001");
		expect(result.senderDisplayName).toBe("Sergey");
		expect(result.metadata?.bookingRef).toBe("SPT-2025-001");
		expect(result.metadata?.senderEmail).toBe("noreply@sputnik.ru");
	});
});

describe("SputnikOutboundAdapter", () => {
	const adapter = new SputnikOutboundAdapter();

	it("resolves recipient from email metadata", () => {
		expect(
			adapter.resolveRecipientId({
				ticketMetadata: { replyToEmail: "guest@example.com" },
			})
		).toBe("guest@example.com");
	});
});

// ─── Cross-channel adapter interface compliance ────────────────────────

describe("all adapters implement interfaces correctly", () => {
	const outboundAdapters: OutboundChannelAdapter[] = [
		new TelegramOutboundAdapter(),
		new EmailOutboundAdapter(),
		new WebOutboundAdapter(),
		new AvitoOutboundAdapter(),
		new SputnikOutboundAdapter(),
	];

	const inboundAdapters: InboundChannelAdapter[] = [
		new TelegramInboundAdapter(),
		new EmailInboundAdapter(),
		new WebInboundAdapter(),
		new AvitoInboundAdapter(),
		new SputnikInboundAdapter(),
	];

	for (const adapter of outboundAdapters) {
		it(`outbound ${adapter.name} has channel, name, send, resolveRecipientId`, () => {
			expect(adapter.channel).toBeTruthy();
			expect(adapter.name).toBeTruthy();
			expect(typeof adapter.send).toBe("function");
			expect(typeof adapter.resolveRecipientId).toBe("function");
		});
	}

	for (const adapter of inboundAdapters) {
		it(`inbound ${adapter.name} has channel, name, normalize`, () => {
			expect(adapter.channel).toBeTruthy();
			expect(adapter.name).toBeTruthy();
			expect(typeof adapter.normalize).toBe("function");
		});
	}

	it("all 5 channels covered for inbound and outbound", () => {
		const outboundChannels = new Set(outboundAdapters.map((a) => a.channel));
		const inboundChannels = new Set(inboundAdapters.map((a) => a.channel));

		for (const ch of [
			"telegram",
			"email",
			"web",
			"avito",
			"sputnik",
		] as const) {
			expect(outboundChannels.has(ch)).toBe(true);
			expect(inboundChannels.has(ch)).toBe(true);
		}
	});
});
