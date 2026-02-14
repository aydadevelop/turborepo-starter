import { describe, expect, it } from "vitest";

import {
	createManagedSupportTicketInputSchema,
	createManagedSupportTicketMessageInputSchema,
	sweepManagedSupportTicketSlaInputSchema,
	updateManagedSupportTicketStatusInputSchema,
} from "../routers/helpdesk.schemas";
import {
	ingestInboundMessageInputSchema,
	processManagedInboundMessageInputSchema,
} from "../routers/intake.schemas";
import {
	processManagedTelegramNotificationInputSchema,
	queueManagedTelegramNotificationInputSchema,
	registerManagedTelegramWebhookEventInputSchema,
} from "../routers/telegram.schemas";

describe("support and intake schemas", () => {
	it("accepts managed support ticket creation payload", () => {
		const result = createManagedSupportTicketInputSchema.safeParse({
			subject: "Need route assistance",
			description: "Customer asked for pickup details",
			priority: "high",
			source: "telegram",
		});

		expect(result.success).toBe(true);
	});

	it("rejects empty support ticket message body", () => {
		const result = createManagedSupportTicketMessageInputSchema.safeParse({
			ticketId: "ticket-1",
			body: "",
		});

		expect(result.success).toBe(false);
	});

	it("accepts support ticket status update payload", () => {
		const result = updateManagedSupportTicketStatusInputSchema.safeParse({
			ticketId: "ticket-1",
			status: "resolved",
		});

		expect(result.success).toBe(true);
	});

	it("accepts support ticket SLA sweep payload", () => {
		const result = sweepManagedSupportTicketSlaInputSchema.safeParse({
			limit: 50,
			now: "2026-03-18T10:00:00.000Z",
			dryRun: false,
		});

		expect(result.success).toBe(true);
	});

	it("accepts inbound message ingestion payload", () => {
		const result = ingestInboundMessageInputSchema.safeParse({
			channel: "telegram",
			externalMessageId: "ext-1",
			payload: JSON.stringify({ text: "Hello" }),
		});

		expect(result.success).toBe(true);
	});

	it("accepts inbound processing payload", () => {
		const result = processManagedInboundMessageInputSchema.safeParse({
			inboundMessageId: "in-1",
			status: "processed",
		});

		expect(result.success).toBe(true);
	});
});

describe("telegram schemas", () => {
	it("accepts notification queue payload", () => {
		const result = queueManagedTelegramNotificationInputSchema.safeParse({
			templateKey: "booking.confirmed",
			recipientChatId: "123",
			idempotencyKey: "notif-1",
		});

		expect(result.success).toBe(true);
	});

	it("requires failure reason for failed notification result", () => {
		const result = processManagedTelegramNotificationInputSchema.safeParse({
			notificationId: "notif-1",
			status: "failed",
		});

		expect(result.success).toBe(false);
	});

	it("accepts webhook registration payload", () => {
		const result = registerManagedTelegramWebhookEventInputSchema.safeParse({
			updateId: 100,
			eventType: "message",
			payload: JSON.stringify({ message: { text: "hello" } }),
		});

		expect(result.success).toBe(true);
	});
});
