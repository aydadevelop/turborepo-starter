import { supportTicket, supportTicketMessage } from "@my-app/db/schema/support";
import { and, eq } from "drizzle-orm";
import type {
	AddTicketMessageInput,
	CreateSupportTicketInput,
	Db,
	ListTicketsFilter,
	SupportTicketMessageRow,
	SupportTicketRow,
} from "./types";

export async function createSupportTicket(
	input: CreateSupportTicketInput,
	db: Db,
): Promise<SupportTicketRow> {
	const [row] = await db
		.insert(supportTicket)
		.values({
			id: crypto.randomUUID(),
			organizationId: input.organizationId,
			bookingId: input.bookingId,
			customerUserId: input.customerUserId,
			createdByUserId: input.createdByUserId,
			subject: input.subject,
			description: input.description,
			priority: input.priority ?? "normal",
			source: input.source ?? "web",
			status: "open",
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create support ticket");
	}

	return row;
}

export async function addTicketMessage(
	input: AddTicketMessageInput,
	db: Db,
): Promise<SupportTicketMessageRow> {
	// Verify ticket belongs to the organization
	const [ticket] = await db
		.select({ id: supportTicket.id })
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.id, input.ticketId),
				eq(supportTicket.organizationId, input.organizationId),
			),
		)
		.limit(1);

	if (!ticket) {
		throw new Error("NOT_FOUND");
	}

	const [row] = await db
		.insert(supportTicketMessage)
		.values({
			id: crypto.randomUUID(),
			ticketId: input.ticketId,
			organizationId: input.organizationId,
			authorUserId: input.authorUserId,
			channel: input.channel ?? "internal",
			body: input.body,
			isInternal: input.isInternal ?? false,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create support ticket message");
	}

	return row;
}

export async function getTicket(
	id: string,
	organizationId: string,
	db: Db,
): Promise<SupportTicketRow> {
	const [row] = await db
		.select()
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.id, id),
				eq(supportTicket.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}

	return row;
}

export function listOrgTickets(
	organizationId: string,
	filter: ListTicketsFilter,
	db: Db,
): Promise<SupportTicketRow[]> {
	const conditions = [eq(supportTicket.organizationId, organizationId)];

	if (filter.status) {
		conditions.push(eq(supportTicket.status, filter.status));
	}
	if (filter.bookingId) {
		conditions.push(eq(supportTicket.bookingId, filter.bookingId));
	}

	const query = db
		.select()
		.from(supportTicket)
		.where(and(...conditions))
		.orderBy(supportTicket.createdAt);

	if (filter.limit !== undefined) {
		query.limit(filter.limit);
	}
	if (filter.offset !== undefined) {
		query.offset(filter.offset);
	}

	return query;
}

export function listCustomerTickets(
	customerUserId: string,
	filter: ListTicketsFilter,
	db: Db,
): Promise<SupportTicketRow[]> {
	const conditions = [eq(supportTicket.customerUserId, customerUserId)];

	if (filter.status) {
		conditions.push(eq(supportTicket.status, filter.status));
	}
	if (filter.bookingId) {
		conditions.push(eq(supportTicket.bookingId, filter.bookingId));
	}

	const query = db
		.select()
		.from(supportTicket)
		.where(and(...conditions))
		.orderBy(supportTicket.createdAt);

	if (filter.limit !== undefined) {
		query.limit(filter.limit);
	}
	if (filter.offset !== undefined) {
		query.offset(filter.offset);
	}

	return query;
}

export async function getCustomerTicket(
	ticketId: string,
	customerUserId: string,
	db: Db,
): Promise<SupportTicketRow> {
	const [row] = await db
		.select()
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.id, ticketId),
				eq(supportTicket.customerUserId, customerUserId),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error("NOT_FOUND");
	}

	return row;
}

export function listTicketMessages(
	ticketId: string,
	db: Db,
): Promise<SupportTicketMessageRow[]> {
	return db
		.select()
		.from(supportTicketMessage)
		.where(
			and(
				eq(supportTicketMessage.ticketId, ticketId),
				eq(supportTicketMessage.isInternal, false),
			),
		)
		.orderBy(supportTicketMessage.createdAt);
}
