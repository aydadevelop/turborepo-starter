import { supportTicket } from "@my-app/db/schema/support";
import { and, asc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type {
	Db,
	ListCustomerTicketsFilter,
	ListOrgTicketsFilter,
	SupportTicketInsert,
	SupportTicketRow,
} from "../shared/types";

export async function insertTicket(
	values: SupportTicketInsert,
	db: Db
): Promise<SupportTicketRow> {
	const [row] = await db.insert(supportTicket).values(values).returning();
	if (!row) {
		throw new Error("Failed to insert support ticket");
	}

	return row;
}

export async function findTicketForOrganization(
	ticketId: string,
	organizationId: string,
	db: Db
): Promise<SupportTicketRow | null> {
	const [row] = await db
		.select()
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.id, ticketId),
				eq(supportTicket.organizationId, organizationId)
			)
		)
		.limit(1);

	return row ?? null;
}

export async function findTicketForCustomer(
	ticketId: string,
	customerUserId: string,
	db: Db
): Promise<SupportTicketRow | null> {
	const [row] = await db
		.select()
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.id, ticketId),
				eq(supportTicket.customerUserId, customerUserId)
			)
		)
		.limit(1);

	return row ?? null;
}

export function listOrganizationTickets(
	organizationId: string,
	filter: ListOrgTicketsFilter,
	db: Db
): Promise<SupportTicketRow[]> {
	const conditions = [eq(supportTicket.organizationId, organizationId)];

	if (filter.status) {
		conditions.push(eq(supportTicket.status, filter.status));
	}
	if (filter.priority) {
		conditions.push(eq(supportTicket.priority, filter.priority));
	}
	if (filter.source) {
		conditions.push(eq(supportTicket.source, filter.source));
	}
	if (filter.bookingId) {
		conditions.push(eq(supportTicket.bookingId, filter.bookingId));
	}
	if (filter.assignedToUserId) {
		conditions.push(
			eq(supportTicket.assignedToUserId, filter.assignedToUserId)
		);
	}
	if (filter.customerUserId) {
		conditions.push(eq(supportTicket.customerUserId, filter.customerUserId));
	}
	if (filter.onlyUnassigned) {
		conditions.push(isNull(supportTicket.assignedToUserId));
	}
	if (filter.onlyOverdue) {
		const overdueStatuses = or(
			eq(supportTicket.status, "open"),
			eq(supportTicket.status, "pending_customer"),
			eq(supportTicket.status, "pending_operator"),
			eq(supportTicket.status, "escalated")
		);

		conditions.push(isNotNull(supportTicket.dueAt));
		conditions.push(lt(supportTicket.dueAt, new Date()));
		if (overdueStatuses) {
			conditions.push(overdueStatuses);
		}
	}

	const query = db
		.select()
		.from(supportTicket)
		.where(and(...conditions))
		.orderBy(asc(supportTicket.createdAt));

	if (filter.limit !== undefined) {
		query.limit(filter.limit);
	}
	if (filter.offset !== undefined) {
		query.offset(filter.offset);
	}

	return query;
}

export function listCustomerOwnedTickets(
	customerUserId: string,
	filter: ListCustomerTicketsFilter,
	db: Db
): Promise<SupportTicketRow[]> {
	const conditions = [eq(supportTicket.customerUserId, customerUserId)];

	if (filter.bookingId) {
		conditions.push(eq(supportTicket.bookingId, filter.bookingId));
	}

	const query = db
		.select()
		.from(supportTicket)
		.where(and(...conditions))
		.orderBy(asc(supportTicket.createdAt));

	if (filter.limit !== undefined) {
		query.limit(filter.limit);
	}
	if (filter.offset !== undefined) {
		query.offset(filter.offset);
	}

	return query;
}

export async function updateTicket(
	ticketId: string,
	organizationId: string,
	values: Partial<SupportTicketInsert>,
	db: Db
): Promise<SupportTicketRow | null> {
	const [row] = await db
		.update(supportTicket)
		.set(values)
		.where(
			and(
				eq(supportTicket.id, ticketId),
				eq(supportTicket.organizationId, organizationId)
			)
		)
		.returning();

	return row ?? null;
}
