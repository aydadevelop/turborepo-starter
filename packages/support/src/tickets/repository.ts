import { supportTicket } from "@my-app/db/schema/support";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	lt,
	or,
} from "drizzle-orm";
import type {
	CustomerSupportTicketListInput,
	Db,
	ListOrgTicketsFilter,
	SupportTicketCollectionResult,
	SupportTicketListInput,
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

export async function listOrganizationTickets(
	organizationId: string,
	input: SupportTicketListInput<ListOrgTicketsFilter>,
	db: Db
): Promise<SupportTicketCollectionResult> {
	const filter = input.filter ?? {};
	const page = input.page ?? { limit: 50, offset: 0 };
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

	if (input.search) {
		conditions.push(
			or(
				ilike(supportTicket.subject, `%${input.search}%`),
				ilike(supportTicket.description, `%${input.search}%`),
			)!,
		);
	}

	const orderBy =
		input.sort?.by === "updated_at"
			? input.sort.dir === "asc"
				? asc(supportTicket.updatedAt)
				: desc(supportTicket.updatedAt)
			: input.sort?.by === "due_at"
				? input.sort.dir === "asc"
					? asc(supportTicket.dueAt)
					: desc(supportTicket.dueAt)
				: input.sort?.by === "priority"
					? input.sort.dir === "asc"
						? asc(supportTicket.priority)
						: desc(supportTicket.priority)
					: input.sort?.by === "status"
						? input.sort.dir === "asc"
							? asc(supportTicket.status)
							: desc(supportTicket.status)
						: input.sort?.dir === "asc"
							? asc(supportTicket.createdAt)
							: desc(supportTicket.createdAt);

	const [items, countResult] = await Promise.all([
		db
			.select()
			.from(supportTicket)
			.where(and(...conditions))
			.orderBy(orderBy)
			.limit(page.limit)
			.offset(page.offset),
		db
			.select({ total: count() })
			.from(supportTicket)
			.where(and(...conditions)),
	]);

	return {
		items,
		total: countResult[0]?.total ?? 0,
	};
}

export async function listCustomerOwnedTickets(
	customerUserId: string,
	input: CustomerSupportTicketListInput,
	db: Db
): Promise<SupportTicketCollectionResult> {
	const filter = input.filter ?? {};
	const page = input.page ?? { limit: 50, offset: 0 };
	const conditions = [eq(supportTicket.customerUserId, customerUserId)];

	if (filter.bookingId) {
		conditions.push(eq(supportTicket.bookingId, filter.bookingId));
	}
	if (filter.status) {
		conditions.push(eq(supportTicket.status, filter.status));
	}

	if (input.search) {
		conditions.push(
			or(
				ilike(supportTicket.subject, `%${input.search}%`),
				ilike(supportTicket.description, `%${input.search}%`),
			)!,
		);
	}

	const orderBy =
		input.sort?.by === "updated_at"
			? input.sort.dir === "asc"
				? asc(supportTicket.updatedAt)
				: desc(supportTicket.updatedAt)
			: input.sort?.by === "status"
				? input.sort.dir === "asc"
					? asc(supportTicket.status)
					: desc(supportTicket.status)
				: input.sort?.dir === "asc"
					? asc(supportTicket.createdAt)
					: desc(supportTicket.createdAt);

	const [items, countResult] = await Promise.all([
		db
			.select()
			.from(supportTicket)
			.where(and(...conditions))
			.orderBy(orderBy)
			.limit(page.limit)
			.offset(page.offset),
		db
			.select({ total: count() })
			.from(supportTicket)
			.where(and(...conditions)),
	]);

	return {
		items,
		total: countResult[0]?.total ?? 0,
	};
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
