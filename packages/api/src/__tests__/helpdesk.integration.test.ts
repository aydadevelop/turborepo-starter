import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { Context } from "../context";

const testDbState = createTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { helpdeskRouter } = await import("../routers/helpdesk");

const managerContext: Context = {
	session: {
		user: {
			id: "user-operator",
		},
	} as Context["session"],
	activeMembership: {
		organizationId: "org-1",
		role: "manager",
	},
	requestUrl: "http://localhost:3000/rpc/helpdesk",
	requestHostname: "localhost",
};

const oneHourMs = 60 * 60 * 1000;

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
		{
			id: "user-assignee",
			name: "Assignee",
			email: "assignee@example.test",
			emailVerified: true,
		},
	]);
};

describe("helpdesk router (integration)", () => {
	beforeAll(() => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);
	});

	afterAll(() => {
		testDbState.close();
	});

	beforeEach(() => {
		clearTestDatabase(testDbState.db);
	});

	it("keeps ticket message threading ordered and updates status only for customer-visible replies", async () => {
		await seedAuthFixtures();

		const createdTicket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Need route update",
				description: "Initial request",
				assignedToUserId: "user-assignee",
			},
			{ context: managerContext }
		);

		expect(createdTicket.status).toBe("open");

		await call(
			helpdeskRouter.messageCreateManaged,
			{
				ticketId: createdTicket.id,
				channel: "internal",
				body: "Internal triage note",
				isInternal: true,
			},
			{ context: managerContext }
		);

		const afterInternalMessage = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: createdTicket.id,
				includeMessages: false,
			},
			{ context: managerContext }
		);
		expect(afterInternalMessage.ticket.status).toBe("open");

		await new Promise((resolve) => setTimeout(resolve, 2));

		await call(
			helpdeskRouter.messageCreateManaged,
			{
				ticketId: createdTicket.id,
				channel: "web",
				body: "Customer follow-up",
				isInternal: false,
			},
			{ context: managerContext }
		);

		const withMessages = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: createdTicket.id,
				includeMessages: true,
			},
			{ context: managerContext }
		);

		expect(withMessages.ticket.status).toBe("pending_operator");
		expect(withMessages.messages).toHaveLength(2);
		expect(withMessages.messages.map((message) => message.body)).toEqual([
			"Internal triage note",
			"Customer follow-up",
		]);

		const listedMessages = await call(
			helpdeskRouter.messageListManaged,
			{
				ticketId: createdTicket.id,
				limit: 10,
			},
			{ context: managerContext }
		);
		expect(listedMessages.map((message) => message.body)).toEqual([
			"Internal triage note",
			"Customer follow-up",
		]);
	});

	it("tracks escalation/closure timestamps and handles terminal-state reply edge cases", async () => {
		await seedAuthFixtures();

		const createdTicket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Escalation test",
			},
			{ context: managerContext }
		);

		const escalated = await call(
			helpdeskRouter.ticketStatusManaged,
			{
				ticketId: createdTicket.id,
				status: "escalated",
			},
			{ context: managerContext }
		);
		expect(escalated.status).toBe("escalated");
		expect(escalated.resolvedAt).toBeNull();
		expect(escalated.closedAt).toBeNull();

		const resolved = await call(
			helpdeskRouter.ticketStatusManaged,
			{
				ticketId: createdTicket.id,
				status: "resolved",
			},
			{ context: managerContext }
		);
		expect(resolved.status).toBe("resolved");
		expect(resolved.resolvedByUserId).toBe("user-operator");
		expect(resolved.resolvedAt).not.toBeNull();
		expect(resolved.closedAt).toBeNull();

		await call(
			helpdeskRouter.messageCreateManaged,
			{
				ticketId: createdTicket.id,
				channel: "web",
				body: "Customer message after resolve",
				isInternal: false,
			},
			{ context: managerContext }
		);
		const afterResolvedReply = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: createdTicket.id,
				includeMessages: false,
			},
			{ context: managerContext }
		);
		expect(afterResolvedReply.ticket.status).toBe("resolved");

		const closed = await call(
			helpdeskRouter.ticketStatusManaged,
			{
				ticketId: createdTicket.id,
				status: "closed",
			},
			{ context: managerContext }
		);
		expect(closed.status).toBe("closed");
		expect(closed.resolvedAt).not.toBeNull();
		expect(closed.closedAt).not.toBeNull();

		await call(
			helpdeskRouter.messageCreateManaged,
			{
				ticketId: createdTicket.id,
				channel: "web",
				body: "Customer message after close",
				isInternal: false,
			},
			{ context: managerContext }
		);
		const afterClosedReply = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: createdTicket.id,
				includeMessages: false,
			},
			{ context: managerContext }
		);
		expect(afterClosedReply.ticket.status).toBe("pending_operator");
		expect(afterClosedReply.ticket.closedAt).not.toBeNull();
	});

	it("applies priority SLA defaults and escalates overdue tickets by sweep", async () => {
		await seedAuthFixtures();

		const highPriorityTicket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "High priority issue",
				priority: "high",
			},
			{ context: managerContext }
		);

		expect(highPriorityTicket.dueAt).not.toBeNull();
		const dueAt = highPriorityTicket.dueAt as Date;
		const highPrioritySlaMs =
			dueAt.getTime() - highPriorityTicket.createdAt.getTime();
		expect(highPrioritySlaMs).toBe(8 * oneHourMs);

		const now = new Date();
		const overdueOpenTicket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Overdue open",
				dueAt: new Date(now.getTime() - 2 * oneHourMs),
			},
			{ context: managerContext }
		);
		const overduePendingTicket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Overdue pending customer",
				dueAt: new Date(now.getTime() - oneHourMs),
			},
			{ context: managerContext }
		);
		await call(
			helpdeskRouter.ticketStatusManaged,
			{
				ticketId: overduePendingTicket.id,
				status: "pending_customer",
			},
			{ context: managerContext }
		);

		const overdueResolvedTicket = await call(
			helpdeskRouter.ticketCreateManaged,
			{
				subject: "Overdue resolved",
				dueAt: new Date(now.getTime() - oneHourMs),
			},
			{ context: managerContext }
		);
		await call(
			helpdeskRouter.ticketStatusManaged,
			{
				ticketId: overdueResolvedTicket.id,
				status: "resolved",
			},
			{ context: managerContext }
		);

		const sweepResult = await call(
			helpdeskRouter.ticketSlaSweepManaged,
			{
				now,
				limit: 10,
			},
			{ context: managerContext }
		);
		expect(sweepResult.dryRun).toBe(false);
		expect(sweepResult.scannedCount).toBe(2);
		expect(sweepResult.escalatedCount).toBe(2);
		expect(sweepResult.escalatedTicketIds).toEqual([
			overdueOpenTicket.id,
			overduePendingTicket.id,
		]);

		const escalatedOpen = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: overdueOpenTicket.id,
				includeMessages: false,
			},
			{ context: managerContext }
		);
		expect(escalatedOpen.ticket.status).toBe("escalated");

		const escalatedPending = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: overduePendingTicket.id,
				includeMessages: false,
			},
			{ context: managerContext }
		);
		expect(escalatedPending.ticket.status).toBe("escalated");

		const stillResolved = await call(
			helpdeskRouter.ticketGetManaged,
			{
				ticketId: overdueResolvedTicket.id,
				includeMessages: false,
			},
			{ context: managerContext }
		);
		expect(stillResolved.ticket.status).toBe("resolved");

		const dryRunSweep = await call(
			helpdeskRouter.ticketSlaSweepManaged,
			{
				now: new Date(now.getTime() + oneHourMs),
				limit: 10,
				dryRun: true,
			},
			{ context: managerContext }
		);
		expect(dryRunSweep.escalatedCount).toBe(0);
		expect(dryRunSweep.escalatedTicketIds).toHaveLength(0);
	});
});
