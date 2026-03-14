import {
	clearEventPushers,
	type DomainEvent,
	registerEventPusher,
} from "@my-app/events";
import { beforeEach, describe, expect, it } from "vitest";
import {
	AGENT_USER_ID,
	BOOKING_ID,
	CUSTOMER_USER_ID,
	getDb,
	makeActorContext,
	ORG_ID,
} from "../../__tests__/fixtures";
import {
	assignTicket,
	createTicket,
	updateTicketDueAt,
	updateTicketPriority,
	updateTicketStatus,
} from "../service";

describe("ticket service", () => {
	beforeEach(() => {
		clearEventPushers();
	});

	it("creates, assigns, reprioritizes, and schedules tickets", async () => {
		const events: DomainEvent[] = [];
		registerEventPusher((event) => {
			events.push(event);
			return Promise.resolve();
		});

		const ticket = await createTicket(
			{
				organizationId: ORG_ID,
				bookingId: BOOKING_ID,
				customerUserId: CUSTOMER_USER_ID,
				subject: "Booking issue",
				description: "Need operator help",
			},
			getDb(),
			makeActorContext(),
		);

		const assigned = await assignTicket(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				assignedToUserId: AGENT_USER_ID,
			},
			getDb(),
			makeActorContext(),
		);

		const reprioritized = await updateTicketPriority(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				priority: "urgent",
			},
			getDb(),
		);

		const dueAt = new Date("2026-03-12T10:00:00.000Z");
		const scheduled = await updateTicketDueAt(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				dueAt,
			},
			getDb(),
		);

		expect(ticket.status).toBe("open");
		expect(assigned.assignedToUserId).toBe(AGENT_USER_ID);
		expect(reprioritized.priority).toBe("urgent");
		expect(scheduled.dueAt?.toISOString()).toBe(dueAt.toISOString());
		expect(events.map((event) => event.type)).toEqual([
			"support:ticket-created",
			"support:ticket-assigned",
		]);
	});

	it("manages resolved and closed audit fields across manual reopen", async () => {
		const ticket = await createTicket(
			{
				organizationId: ORG_ID,
				customerUserId: CUSTOMER_USER_ID,
				subject: "Lifecycle ticket",
			},
			getDb(),
			makeActorContext(),
		);

		const resolved = await updateTicketStatus(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				status: "resolved",
			},
			getDb(),
			makeActorContext(),
		);
		expect(resolved.resolvedAt).not.toBeNull();
		expect(resolved.resolvedByUserId).toBeDefined();
		expect(resolved.closedAt).toBeNull();

		const closed = await updateTicketStatus(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				status: "closed",
			},
			getDb(),
			makeActorContext(),
		);
		expect(closed.closedAt).not.toBeNull();
		expect(closed.closedByUserId).toBeDefined();

		const reopened = await updateTicketStatus(
			{
				ticketId: ticket.id,
				organizationId: ORG_ID,
				status: "open",
			},
			getDb(),
			makeActorContext(),
		);
		expect(reopened.status).toBe("open");
		expect(reopened.resolvedAt).toBeNull();
		expect(reopened.resolvedByUserId).toBeNull();
		expect(reopened.closedAt).toBeNull();
		expect(reopened.closedByUserId).toBeNull();
	});
});
