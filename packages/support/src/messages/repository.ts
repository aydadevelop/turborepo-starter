import { supportTicketMessage } from "@my-app/db/schema/support";
import { and, asc, eq } from "drizzle-orm";
import type {
	Db,
	SupportTicketMessageInsert,
	SupportTicketMessageRow,
} from "../shared/types";

export async function insertTicketMessage(
	values: SupportTicketMessageInsert,
	db: Db,
): Promise<SupportTicketMessageRow> {
	const [row] = await db
		.insert(supportTicketMessage)
		.values(values)
		.returning();

	if (!row) {
		throw new Error("Failed to insert support ticket message");
	}

	return row;
}

export function listOperatorMessages(
	ticketId: string,
	organizationId: string,
	db: Db,
): Promise<SupportTicketMessageRow[]> {
	return db
		.select()
		.from(supportTicketMessage)
		.where(
			and(
				eq(supportTicketMessage.ticketId, ticketId),
				eq(supportTicketMessage.organizationId, organizationId),
			),
		)
		.orderBy(asc(supportTicketMessage.createdAt));
}

export function listCustomerVisibleMessages(
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
		.orderBy(asc(supportTicketMessage.createdAt));
}
