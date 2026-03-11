import {
	clearEventPushers,
	type DomainEvent,
	registerEventPusher,
} from "@my-app/events";
import { beforeEach, describe, expect, it } from "vitest";
import {
	CUSTOMER_USER_ID,
	getDb,
	makeWorkflowContext,
	ORG_ID,
} from "../../__tests__/fixtures";
import { listOrgTickets } from "../../tickets/service";
import { processInboundSupportIntent } from "../workflow";

describe("inbound workflow", () => {
	beforeEach(() => {
		clearEventPushers();
	});

	it("persists inbound intake, creates a ticket, and emits support events", async () => {
		const events: DomainEvent[] = [];
		registerEventPusher((event) => {
			events.push(event);
			return Promise.resolve();
		});

		const output = await processInboundSupportIntent(
			{
				organizationId: ORG_ID,
				channel: "email",
				externalMessageId: "email-1",
				externalThreadId: "thread-1",
				dedupeKey: "email:thread-1:1",
				senderDisplayName: "Alice",
				normalizedText: "Need help with my booking",
				payload: { subject: "Help" },
				customerUserId: CUSTOMER_USER_ID,
			},
			getDb(),
			makeWorkflowContext()
		);

		expect(output.inbound.status).toBe("processed");
		expect(output.ticket.subject).toBe("Message from Alice");
		expect(output.ticket.status).toBe("pending_operator");
		expect(output.message.inboundMessageId).toBe(output.inbound.id);
		expect(events.map((event) => event.type)).toEqual([
			"support:inbound-received",
			"support:ticket-created",
			"support:message-added",
			"support:ticket-status-changed",
			"support:inbound-processed",
		]);
	});

	it("reuses the linked ticket for later inbound messages on the same external thread", async () => {
		const first = await processInboundSupportIntent(
			{
				organizationId: ORG_ID,
				channel: "telegram",
				externalMessageId: "telegram-1",
				externalThreadId: "telegram-thread-1",
				dedupeKey: "telegram:thread-1:1",
				normalizedText: "First inbound",
				payload: {},
			},
			getDb(),
			makeWorkflowContext({ idempotencyKey: "support-inbound-1" })
		);

		const second = await processInboundSupportIntent(
			{
				organizationId: ORG_ID,
				channel: "telegram",
				externalMessageId: "telegram-2",
				externalThreadId: "telegram-thread-1",
				dedupeKey: "telegram:thread-1:2",
				normalizedText: "Second inbound",
				payload: {},
			},
			getDb(),
			makeWorkflowContext({ idempotencyKey: "support-inbound-2" })
		);

		const tickets = await listOrgTickets(ORG_ID, {}, getDb());
		expect(second.ticket.id).toBe(first.ticket.id);
		expect(tickets).toHaveLength(1);
	});

	it("rejects duplicate inbound dedupe keys", async () => {
		await processInboundSupportIntent(
			{
				organizationId: ORG_ID,
				channel: "web",
				externalMessageId: "web-1",
				dedupeKey: "web:dup:1",
				normalizedText: "First inbound",
				payload: {},
			},
			getDb(),
			makeWorkflowContext({ idempotencyKey: "support-inbound-3" })
		);

		await expect(
			processInboundSupportIntent(
				{
					organizationId: ORG_ID,
					channel: "web",
					externalMessageId: "web-2",
					dedupeKey: "web:dup:1",
					normalizedText: "Duplicate inbound",
					payload: {},
				},
				getDb(),
				makeWorkflowContext({ idempotencyKey: "support-inbound-4" })
			)
		).rejects.toThrow("DUPLICATE_INBOUND_MESSAGE");
	});
});
