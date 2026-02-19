import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { bootstrapTestDatabase } from "@full-stack-cf-app/db/test";
import type { LegacyNotificationQueueMessage as NotificationQueueMessage } from "@full-stack-cf-app/notifications/contracts";
import { call } from "@orpc/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createManagedContext } from "./utils/context";

const testDbState = bootstrapTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { telegramRouter } = await import("../routers/telegram");

const queueSendMock = vi.fn(
	(
		_message: NotificationQueueMessage,
		_options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	) => {
		return Promise.resolve();
	}
);

const managerContext = createManagedContext({
	userId: "user-operator",
	organizationId: "org-1",
	role: "manager",
	requestUrl: "http://localhost:3000/rpc/telegram/notificationQueueManaged",
	notificationQueue: {
		send: queueSendMock,
	},
});

const seedAuthFixtures = async () => {
	await testDbState.db.insert(organization).values({
		id: "org-1",
		name: "Org",
		slug: "org",
	});

	await testDbState.db.insert(user).values({
		id: "user-operator",
		name: "Operator",
		email: "operator@example.test",
		emailVerified: true,
	});
};

describe("telegram router (integration)", () => {
	beforeAll(async () => {
		await seedAuthFixtures();
	});

	beforeEach(() => {
		queueSendMock.mockClear();
	});

	it("publishes queue message when notification is created", async () => {
		const created = await call(
			telegramRouter.notificationQueueManaged,
			{
				templateKey: "support.ticket.created",
				recipientChatId: "100500",
				idempotencyKey: "idem-tg-1",
				payload: '{"ticketId":"ticket-1"}',
			},
			{ context: managerContext }
		);

		expect(created.idempotent).toBe(false);
		expect(queueSendMock).toHaveBeenCalledTimes(1);
		expect(queueSendMock).toHaveBeenCalledWith(
			{
				kind: "telegram.notification.dispatch.v1",
				notificationId: created.notification.id,
				organizationId: "org-1",
			},
			{ contentType: "json" }
		);
	});

	it("returns idempotent response and does not republish queue message", async () => {
		await call(
			telegramRouter.notificationQueueManaged,
			{
				templateKey: "support.ticket.created",
				recipientChatId: "100500",
				idempotencyKey: "idem-tg-repeat",
			},
			{ context: managerContext }
		);

		const second = await call(
			telegramRouter.notificationQueueManaged,
			{
				templateKey: "support.ticket.created",
				recipientChatId: "100500",
				idempotencyKey: "idem-tg-repeat",
			},
			{ context: managerContext }
		);

		expect(second.idempotent).toBe(true);
		expect(queueSendMock).toHaveBeenCalledTimes(1);
	});
});
