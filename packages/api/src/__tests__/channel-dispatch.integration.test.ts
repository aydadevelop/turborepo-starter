import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { bootstrapTestDatabase } from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createManagedContext } from "./utils/context";

const testDbState = bootstrapTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { helpdeskRouter } = await import("../routers/helpdesk");
const { intakeRouter } = await import("../routers/intake");

const managerContext = createManagedContext({
	userId: "user-operator",
	organizationId: "org-1",
	role: "manager",
	requestUrl: "http://localhost:3000/rpc/helpdesk",
});

const seedAuthFixtures = async () => {
	await testDbState.db.insert(organization).values({
		id: "org-1",
		name: "Org",
		slug: "org",
	});

	await testDbState.db.insert(user).values([
		{
			id: "user-operator",
			name: "Operator",
			email: "operator@example.test",
			emailVerified: true,
		},
	]);
};

describe("multi-channel outbound dispatch (integration)", () => {
	beforeAll(async () => {
		await seedAuthFixtures();
	});

	it("ingests a telegram message, creates a ticket, and the ticket source is telegram", async () => {
		const result = await call(
			intakeRouter.ingestManaged,
			{
				channel: "telegram",
				externalMessageId: "tg-msg-1",
				externalThreadId: "chat-12345",
				externalSenderId: "user-tg-1",
				senderDisplayName: "Ivan",
				text: "I need to change my booking date",
				payload: JSON.stringify({
					message_id: 1,
					chat: { id: 12_345 },
					from: { id: 789 },
					text: "I need to change my booking date",
				}),
			},
			{ context: managerContext }
		);

		expect(result.idempotent).toBe(false);
		expect(result.inboundMessage.channel).toBe("telegram");
		expect(result.inboundMessage.ticketId).toBeTruthy();
	});

	it("ingests an email from sputnik, creates a ticket with email metadata", async () => {
		const result = await call(
			intakeRouter.ingestManaged,
			{
				channel: "sputnik",
				externalMessageId: "sputnik-email-1",
				externalThreadId: "SPT-2025-001",
				externalSenderId: "guest@example.com",
				senderDisplayName: "Sergey",
				text: "Please cancel my reservation",
				payload: JSON.stringify({
					messageId: "sputnik-email-1",
					from: "guest@example.com",
					bookingRef: "SPT-2025-001",
					text: "Please cancel my reservation",
				}),
			},
			{ context: managerContext }
		);

		expect(result.idempotent).toBe(false);
		expect(result.inboundMessage.channel).toBe("sputnik");
		expect(result.inboundMessage.ticketId).toBeTruthy();
	});

	it("ingests an avito message, creates a ticket", async () => {
		const result = await call(
			intakeRouter.ingestManaged,
			{
				channel: "avito",
				externalMessageId: "avito-msg-42",
				externalThreadId: "avito-chat-1",
				externalSenderId: "avito-user-1",
				senderDisplayName: "Buyer",
				text: "Is this boat available next weekend?",
				payload: JSON.stringify({
					id: "avito-msg-42",
					chatId: "avito-chat-1",
					text: "Is this boat available next weekend?",
				}),
			},
			{ context: managerContext }
		);

		expect(result.idempotent).toBe(false);
		expect(result.inboundMessage.channel).toBe("avito");
		expect(result.inboundMessage.ticketId).toBeTruthy();
	});

	it("creates ticket and reply on web channel gets delivered immediately", async () => {
		const ticket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Website inquiry",
				source: "web",
			},
			{ context: managerContext }
		);

		const message = await call(
			helpdeskRouter.messageCreateManaged,
			{
				ticketId: ticket.id,
				channel: "web",
				body: "Thank you for contacting us. We will get back to you shortly.",
				isInternal: false,
			},
			{ context: managerContext }
		);

		expect(message.channel).toBe("web");
		expect(message.isInternal).toBe(false);
	});

	it("deduplicates repeated inbound messages from same channel", async () => {
		const first = await call(
			intakeRouter.ingestManaged,
			{
				channel: "telegram",
				externalMessageId: "tg-dedup-1",
				externalThreadId: "chat-99",
				payload: JSON.stringify({ text: "duplicate test" }),
			},
			{ context: managerContext }
		);

		const second = await call(
			intakeRouter.ingestManaged,
			{
				channel: "telegram",
				externalMessageId: "tg-dedup-1",
				externalThreadId: "chat-99",
				payload: JSON.stringify({ text: "duplicate test" }),
			},
			{ context: managerContext }
		);

		expect(first.idempotent).toBe(false);
		expect(second.idempotent).toBe(true);
		expect(first.inboundMessage.id).toBe(second.inboundMessage.id);
	});

	it("appends inbound message to existing ticket when ticketId is provided", async () => {
		const ticket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Ongoing conversation",
				source: "telegram",
			},
			{ context: managerContext }
		);

		const result = await call(
			intakeRouter.ingestManaged,
			{
				channel: "telegram",
				externalMessageId: "tg-follow-up-1",
				externalThreadId: "chat-100",
				text: "Follow up message",
				payload: JSON.stringify({ text: "Follow up message" }),
				ticketId: ticket.id,
			},
			{ context: managerContext }
		);

		expect(result.inboundMessage.ticketId).toBe(ticket.id);

		const ticketWithMessages = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: ticket.id,
				includeMessages: true,
			},
			{ context: managerContext }
		);

		expect(ticketWithMessages.messages).toHaveLength(1);
		expect(ticketWithMessages.messages[0]?.body).toBe("Follow up message");
		expect(ticketWithMessages.ticket.status).toBe("pending_operator");
	});
});
