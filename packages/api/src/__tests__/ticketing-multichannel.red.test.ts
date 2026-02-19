import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import {
	inboundMessage,
	supportTicket,
	supportTicketMessage,
	telegramNotification,
} from "@full-stack-cf-app/db/schema/support";
import { bootstrapTestDatabase } from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createManagedContext, createUserContext } from "./utils/context";

const testDbState = bootstrapTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { intakeRouter } = await import("../routers/intake");
const { helpdeskRouter } = await import("../routers/helpdesk");
const { adminSupportRouter } = await import("../routers/admin/support");

const managerContext = createManagedContext({
	userId: "user-operator",
	organizationId: "org-1",
	role: "manager",
	requestUrl: "http://localhost:3000/rpc/helpdesk",
});

const adminContext = createUserContext({
	userId: "user-admin",
	requestUrl: "http://localhost:3000/rpc/admin/support/listTickets",
});

const seedOrganization = async () => {
	await testDbState.db.insert(organization).values({
		id: "org-1",
		name: "Org",
		slug: "org",
	});
};

const seedUsers = async () => {
	await testDbState.db.insert(user).values([
		{
			id: "user-operator",
			name: "Operator",
			email: "operator@example.test",
			emailVerified: true,
		},
		{
			id: "user-admin",
			name: "Platform Admin",
			email: "admin@example.test",
			emailVerified: true,
			role: "admin",
		},
	]);
};

describe("ticketing multichannel (red)", () => {
	beforeAll(async () => {
		await seedOrganization();
		await seedUsers();
	});

	it("creates ticket + first threaded message when ingesting external traffic without ticketId", async () => {
		const result = await call(
			intakeRouter.ingestManaged,
			{
				channel: "telegram",
				externalMessageId: "tg-msg-1",
				externalThreadId: "chat-100500",
				externalSenderId: "sender-1",
				senderDisplayName: "Customer One",
				text: "Need to move booking by 1 hour",
				payload: JSON.stringify({
					message: { text: "Need to move booking by 1 hour" },
				}),
			},
			{ context: managerContext }
		);

		expect(result.idempotent).toBe(false);

		const [storedInboundMessage] = await testDbState.db
			.select()
			.from(inboundMessage)
			.where(eq(inboundMessage.id, result.inboundMessage.id))
			.limit(1);

		expect(storedInboundMessage?.ticketId).toBeTruthy();

		const tickets = await testDbState.db
			.select()
			.from(supportTicket)
			.where(eq(supportTicket.organizationId, "org-1"));

		expect(tickets).toHaveLength(1);
		expect(tickets[0]?.source).toBe("telegram");

		const ticketId = tickets[0]?.id;
		expect(ticketId).toBeTruthy();
		if (!ticketId) {
			throw new Error("Expected ticket id to be created");
		}

		const messages = await testDbState.db
			.select()
			.from(supportTicketMessage)
			.where(eq(supportTicketMessage.ticketId, ticketId));

		expect(messages).toHaveLength(1);
		expect(messages[0]?.channel).toBe("telegram");
		expect(messages[0]?.body).toContain("Need to move booking by 1 hour");
	});

	it("queues telegram outbound dispatch when an operator replies on telegram channel", async () => {
		const ticket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Telegram booking question",
				source: "telegram",
				metadata: JSON.stringify({ telegramChatId: "100500" }),
			},
			{ context: managerContext }
		);

		await call(
			helpdeskRouter.messageCreateManaged,
			{
				ticketId: ticket.id,
				channel: "telegram",
				body: "We can move your slot to 16:00.",
				isInternal: false,
			},
			{ context: managerContext }
		);

		const queuedNotifications = await testDbState.db
			.select()
			.from(telegramNotification)
			.where(
				and(
					eq(telegramNotification.organizationId, "org-1"),
					eq(telegramNotification.ticketId, ticket.id)
				)
			);

		expect(queuedNotifications).toHaveLength(1);
		expect(queuedNotifications[0]?.recipientChatId).toBe("100500");
		expect(queuedNotifications[0]?.status).toBe("queued");
		expect(queuedNotifications[0]?.payload ?? "").toContain(
			"We can move your slot to 16:00."
		);
	});

	it("finds tickets by description text in admin list search", async () => {
		await testDbState.db.insert(supportTicket).values([
			{
				id: "ticket-subject-match",
				organizationId: "org-1",
				source: "web",
				status: "open",
				priority: "normal",
				subject: "General issue",
				description: "Nothing special",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "ticket-description-only",
				organizationId: "org-1",
				source: "telegram",
				status: "open",
				priority: "normal",
				subject: "Plain title",
				description: "Contains reference REF-42 for billing follow-up",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		const listResult = await call(
			adminSupportRouter.listTickets,
			{
				limit: 20,
				offset: 0,
				search: "REF-42",
			},
			{ context: adminContext }
		);

		expect(listResult.items.map((item) => item.id)).toContain(
			"ticket-description-only"
		);
	});

	it("filters admin support list by source channel", async () => {
		await testDbState.db.insert(supportTicket).values([
			{
				id: "ticket-telegram-1",
				organizationId: "org-1",
				source: "telegram",
				status: "open",
				priority: "normal",
				subject: "Telegram case",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "ticket-email-1",
				organizationId: "org-1",
				source: "email",
				status: "open",
				priority: "normal",
				subject: "Email case",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		const listResult = await call(
			adminSupportRouter.listTickets,
			{
				limit: 20,
				offset: 0,
				source: "telegram",
			},
			{ context: adminContext }
		);

		expect(listResult.items).toHaveLength(1);
		expect(listResult.items[0]?.source).toBe("telegram");
	});
});
