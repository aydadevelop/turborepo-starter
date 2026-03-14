import { inboundMessage } from "@my-app/db/schema/support";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { SUPPORT_ERROR_CODES, SupportError } from "../shared/errors";
import type {
	Db,
	InboundMessageInsert,
	InboundMessageRow,
	InboundMessageStatus,
} from "../shared/types";

export async function insertInboundMessage(
	values: InboundMessageInsert,
	db: Db,
): Promise<InboundMessageRow> {
	const [row] = await db
		.insert(inboundMessage)
		.values(values)
		.onConflictDoNothing()
		.returning();

	if (!row) {
		throw new SupportError(SUPPORT_ERROR_CODES.duplicateInboundMessage);
	}

	return row;
}

export async function findTicketIdByExternalThread(
	input: {
		channel: InboundMessageRow["channel"];
		externalThreadId?: string | null;
		organizationId: string;
	},
	db: Db,
): Promise<string | null> {
	if (!input.externalThreadId) {
		return null;
	}

	const [row] = await db
		.select({ ticketId: inboundMessage.ticketId })
		.from(inboundMessage)
		.where(
			and(
				eq(inboundMessage.organizationId, input.organizationId),
				eq(inboundMessage.channel, input.channel),
				eq(inboundMessage.externalThreadId, input.externalThreadId),
				isNotNull(inboundMessage.ticketId),
			),
		)
		.orderBy(desc(inboundMessage.receivedAt))
		.limit(1);

	return row?.ticketId ?? null;
}

export async function updateInboundProcessingState(
	input: {
		errorMessage?: string | null;
		id: string;
		processedAt?: Date | null;
		status: InboundMessageStatus;
		ticketId?: string | null;
	},
	db: Db,
): Promise<InboundMessageRow> {
	const [row] = await db
		.update(inboundMessage)
		.set({
			ticketId: input.ticketId ?? null,
			status: input.status,
			errorMessage: input.errorMessage ?? null,
			processedAt: input.processedAt ?? null,
		})
		.where(eq(inboundMessage.id, input.id))
		.returning();

	if (!row) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	return row;
}
