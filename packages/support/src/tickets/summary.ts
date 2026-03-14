import { supportTicket } from "@my-app/db/schema/support";
import { and, count, eq, isNull, lt } from "drizzle-orm";

import type {
	Db,
	SupportOperatorSummary,
	SupportTicketStatus,
} from "../shared/types";

async function countByStatus(
	organizationId: string,
	status: SupportTicketStatus,
	db: Db,
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(supportTicket)
		.where(
			and(
				eq(supportTicket.organizationId, organizationId),
				eq(supportTicket.status, status),
			),
		);

	return Number(row?.count ?? 0);
}

export async function getSupportOperatorSummary(
	organizationId: string,
	db: Db,
): Promise<SupportOperatorSummary> {
	const now = new Date();
	const [
		openCount,
		pendingCustomerCount,
		pendingOperatorCount,
		escalatedCount,
		resolvedCount,
		closedCount,
		unassignedRow,
		overdueRow,
	] = await Promise.all([
		countByStatus(organizationId, "open", db),
		countByStatus(organizationId, "pending_customer", db),
		countByStatus(organizationId, "pending_operator", db),
		countByStatus(organizationId, "escalated", db),
		countByStatus(organizationId, "resolved", db),
		countByStatus(organizationId, "closed", db),
		db
			.select({ count: count() })
			.from(supportTicket)
			.where(
				and(
					eq(supportTicket.organizationId, organizationId),
					isNull(supportTicket.assignedToUserId),
				),
			),
		db
			.select({ count: count() })
			.from(supportTicket)
			.where(
				and(
					eq(supportTicket.organizationId, organizationId),
					lt(supportTicket.dueAt, now),
				),
			),
	]);

	return {
		closedCount,
		escalatedCount,
		openCount,
		overdueCount: Number(overdueRow[0]?.count ?? 0),
		pendingCustomerCount,
		pendingOperatorCount,
		resolvedCount,
		unassignedCount: Number(unassignedRow[0]?.count ?? 0),
	};
}
