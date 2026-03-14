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
	SupportTicketInsert,
	SupportTicketListInput,
	SupportTicketRow,
} from "../shared/types";

type TicketCondition =
	| ReturnType<typeof eq>
	| ReturnType<typeof isNotNull>
	| ReturnType<typeof isNull>
	| ReturnType<typeof lt>
	| NonNullable<ReturnType<typeof or>>;

const buildTicketSearchCondition = (search: string) => {
	const searchCondition = or(
		ilike(supportTicket.subject, `%${search}%`),
		ilike(supportTicket.description, `%${search}%`)
	);
	if (!searchCondition) {
		throw new Error("Failed to build support ticket search condition");
	}

	return searchCondition;
};

const buildOverdueStatusesCondition = () => {
	const overdueStatuses = or(
		eq(supportTicket.status, "open"),
		eq(supportTicket.status, "pending_customer"),
		eq(supportTicket.status, "pending_operator"),
		eq(supportTicket.status, "escalated")
	);
	if (!overdueStatuses) {
		throw new Error("Failed to build overdue support ticket status condition");
	}

	return overdueStatuses;
};

const buildOrganizationTicketConditions = (
	organizationId: string,
	input: SupportTicketListInput<ListOrgTicketsFilter>
): TicketCondition[] => {
	const filter = input.filter ?? {};
	const search = input.search?.trim();
	const conditions: TicketCondition[] = [
		eq(supportTicket.organizationId, organizationId),
	];

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
		conditions.push(isNotNull(supportTicket.dueAt));
		conditions.push(lt(supportTicket.dueAt, new Date()));
		conditions.push(buildOverdueStatusesCondition());
	}
	if (search) {
		conditions.push(buildTicketSearchCondition(search));
	}

	return conditions;
};

const buildCustomerTicketConditions = (
	customerUserId: string,
	input: CustomerSupportTicketListInput
): TicketCondition[] => {
	const filter = input.filter ?? {};
	const search = input.search?.trim();
	const conditions: TicketCondition[] = [
		eq(supportTicket.customerUserId, customerUserId),
	];

	if (filter.bookingId) {
		conditions.push(eq(supportTicket.bookingId, filter.bookingId));
	}
	if (filter.status) {
		conditions.push(eq(supportTicket.status, filter.status));
	}
	if (search) {
		conditions.push(buildTicketSearchCondition(search));
	}

	return conditions;
};

const resolveOrganizationTicketOrderBy = (
	sort: SupportTicketListInput<ListOrgTicketsFilter>["sort"]
) => {
	const direction = sort?.dir ?? "desc";

	if (sort?.by === "updated_at") {
		return direction === "asc"
			? asc(supportTicket.updatedAt)
			: desc(supportTicket.updatedAt);
	}
	if (sort?.by === "due_at") {
		return direction === "asc"
			? asc(supportTicket.dueAt)
			: desc(supportTicket.dueAt);
	}
	if (sort?.by === "priority") {
		return direction === "asc"
			? asc(supportTicket.priority)
			: desc(supportTicket.priority);
	}
	if (sort?.by === "status") {
		return direction === "asc"
			? asc(supportTicket.status)
			: desc(supportTicket.status);
	}

	return direction === "asc"
		? asc(supportTicket.createdAt)
		: desc(supportTicket.createdAt);
};

const resolveCustomerTicketOrderBy = (
	sort: CustomerSupportTicketListInput["sort"]
) => {
	const direction = sort?.dir ?? "desc";

	if (sort?.by === "updated_at") {
		return direction === "asc"
			? asc(supportTicket.updatedAt)
			: desc(supportTicket.updatedAt);
	}
	if (sort?.by === "status") {
		return direction === "asc"
			? asc(supportTicket.status)
			: desc(supportTicket.status);
	}

	return direction === "asc"
		? asc(supportTicket.createdAt)
		: desc(supportTicket.createdAt);
};

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
	const page = input.page ?? { limit: 50, offset: 0 };
	const conditions = buildOrganizationTicketConditions(organizationId, input);
	const orderBy = resolveOrganizationTicketOrderBy(input.sort);

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
	const page = input.page ?? { limit: 50, offset: 0 };
	const conditions = buildCustomerTicketConditions(customerUserId, input);
	const orderBy = resolveCustomerTicketOrderBy(input.sort);

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
