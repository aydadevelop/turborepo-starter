import {
	clearEventPushers,
	type DomainEvent,
	registerEventPusher,
} from "@my-app/events";
import { beforeEach, describe, expect, it } from "vitest";
import {
	CUSTOMER_USER_ID,
	getDb,
	makeActorContext,
	ORG_ID,
} from "../../__tests__/fixtures";
import { createTicket, getTicket } from "../../tickets/service";
import {
	addCustomerTicketMessage,
	addTicketMessage,
	getCustomerTicketThread,
	getOperatorTicketThread,
} from "../service";

describe("message service", () => {
	beforeEach(() => {
		clearEventPushers();
	});

	it("moves operator public replies to pending_customer and emits support events", async () => {
		const ticket = await createTicket(
			{
				organizationId: ORG_ID,
				customerUserId: CUSTOMER_USER_ID,
				subject: "Operator reply ticket",
			},
			getDb(),
			makeActorContext(),
		);

		const events: DomainEvent[] = [];
		clearEventPushers();
		registerEventPusher((event) => {
			events.push(event);
			return Promise.resolve();
		});

		const message = await addTicketMessage(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				authorUserId: makeActorContext().actorUserId,
				channel: "web",
				body: "Operator reply",
				isInternal: false,
			},
			getDb(),
			makeActorContext(),
		);

		const updatedTicket = await getTicket(ticket.id, ORG_ID, getDb());
		expect(message.channel).toBe("web");
		expect(updatedTicket.status).toBe("pending_customer");
		expect(events.map((event) => event.type)).toEqual([
			"support:message-added",
			"support:ticket-status-changed",
		]);
	});

	it("moves customer replies to pending_operator and leaves internal notes unchanged", async () => {
		const ticket = await createTicket(
			{
				organizationId: ORG_ID,
				customerUserId: CUSTOMER_USER_ID,
				subject: "Customer follow-up ticket",
			},
			getDb(),
			makeActorContext(),
		);

		await addTicketMessage(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				body: "Internal note only",
				isInternal: true,
			},
			getDb(),
			makeActorContext(),
		);
		expect((await getTicket(ticket.id, ORG_ID, getDb())).status).toBe("open");

		await addCustomerTicketMessage(
			{
				ticketId: ticket.id,
				customerUserId: CUSTOMER_USER_ID,
				authorUserId: CUSTOMER_USER_ID,
				body: "Customer reply",
			},
			getDb(),
			makeActorContext({ actorUserId: CUSTOMER_USER_ID }),
		);

		expect((await getTicket(ticket.id, ORG_ID, getDb())).status).toBe(
			"pending_operator",
		);
	});

	it("returns operator-visible internal notes while hiding them from customers", async () => {
		const ticket = await createTicket(
			{
				organizationId: ORG_ID,
				customerUserId: CUSTOMER_USER_ID,
				subject: "Thread visibility ticket",
			},
			getDb(),
			makeActorContext(),
		);

		await addTicketMessage(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				body: "Internal note",
				isInternal: true,
			},
			getDb(),
			makeActorContext(),
		);
		await addTicketMessage(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				body: "Public update",
				channel: "web",
				isInternal: false,
			},
			getDb(),
			makeActorContext(),
		);

		const operatorThread = await getOperatorTicketThread(
			ticket.id,
			ORG_ID,
			getDb(),
		);
		const customerThread = await getCustomerTicketThread(
			ticket.id,
			CUSTOMER_USER_ID,
			getDb(),
		);

		expect(operatorThread.messages).toHaveLength(2);
		expect(operatorThread.messages.some((message) => message.isInternal)).toBe(
			true,
		);
		expect(customerThread.messages).toHaveLength(1);
		expect(
			customerThread.messages.every((message) => !message.isInternal),
		).toBe(true);
	});
});
