import { SUPPORT_ERROR_CODES, SupportError } from "../shared/errors";
import {
	emitSupportMessageAdded,
	emitSupportTicketStatusChanged,
} from "../shared/events";
import {
	buildTicketStatusPatch,
	getFollowupStatusFromMessage,
} from "../shared/status";
import type {
	AddCustomerTicketMessageInput,
	AddTicketMessageInput,
	CustomerTicketThread,
	Db,
	OperatorTicketThread,
	SupportActorContext,
	SupportTicketMessageRow,
} from "../shared/types";
import { updateTicket } from "../tickets/repository";
import {
	getCustomerTicket,
	getTicket,
	requireTicketForCustomer,
	requireTicketForOrganization,
} from "../tickets/service";
import {
	insertTicketMessage,
	listCustomerVisibleMessages,
	listOperatorMessages,
} from "./repository";

const persistMessage = async (
	input: {
		authorKind: "customer" | "inbound" | "operator";
		ticketId: string;
		organizationId: string;
		authorUserId?: string;
		body: string;
		channel: AddTicketMessageInput["channel"];
		isInternal: boolean;
		attachments?: AddTicketMessageInput["attachments"];
		inboundMessageId?: string;
	},
	db: Db,
	actorContext?: SupportActorContext,
): Promise<{
	message: SupportTicketMessageRow;
	previousStatus: string | null;
	status: string | null;
}> => {
	const result = await db.transaction(async (tx) => {
		const transactionDb = tx as unknown as Db;
		const ticket = await requireTicketForOrganization(
			input.ticketId,
			input.organizationId,
			transactionDb,
		);

		const message = await insertTicketMessage(
			{
				id: crypto.randomUUID(),
				ticketId: input.ticketId,
				organizationId: input.organizationId,
				authorUserId: input.authorUserId,
				channel: input.channel ?? "internal",
				body: input.body,
				isInternal: input.isInternal,
				attachments: input.attachments,
				inboundMessageId: input.inboundMessageId,
			},
			transactionDb,
		);

		const nextStatus = getFollowupStatusFromMessage(
			input.isInternal,
			input.authorKind,
		);

		if (!nextStatus || ticket.status === nextStatus) {
			return {
				message,
				previousStatus: null,
				status: null,
				organizationId: ticket.organizationId,
			};
		}

		const updatedTicket = await updateTicket(
			ticket.id,
			ticket.organizationId,
			buildTicketStatusPatch(nextStatus, actorContext),
			transactionDb,
		);

		if (!updatedTicket) {
			throw new SupportError(SUPPORT_ERROR_CODES.notFound);
		}

		return {
			message,
			organizationId: updatedTicket.organizationId,
			previousStatus: ticket.status,
			status: updatedTicket.status,
		};
	});

	await emitSupportMessageAdded(actorContext, {
		message: result.message,
		organizationId: input.organizationId,
	});

	if (result.previousStatus && result.status) {
		await emitSupportTicketStatusChanged(actorContext, {
			organizationId: input.organizationId,
			previousStatus: result.previousStatus,
			status: result.status as typeof result.previousStatus,
			ticketId: input.ticketId,
		});
	}

	return result;
};

export async function addTicketMessage(
	input: AddTicketMessageInput,
	db: Db,
	actorContext?: SupportActorContext,
): Promise<SupportTicketMessageRow> {
	await requireTicketForOrganization(input.ticketId, input.organizationId, db);

	const result = await persistMessage(
		{
			authorKind: "operator",
			ticketId: input.ticketId,
			organizationId: input.organizationId,
			authorUserId: input.authorUserId,
			body: input.body,
			channel: input.channel,
			isInternal: input.isInternal ?? false,
			attachments: input.attachments,
			inboundMessageId: input.inboundMessageId,
		},
		db,
		actorContext,
	);

	return result.message;
}

export async function addCustomerTicketMessage(
	input: AddCustomerTicketMessageInput,
	db: Db,
	actorContext?: SupportActorContext,
): Promise<SupportTicketMessageRow> {
	const ticket = await requireTicketForCustomer(
		input.ticketId,
		input.customerUserId,
		db,
	);

	const result = await persistMessage(
		{
			authorKind: "customer",
			ticketId: input.ticketId,
			organizationId: ticket.organizationId,
			authorUserId: input.authorUserId,
			body: input.body,
			channel: "web",
			isInternal: false,
			attachments: input.attachments,
		},
		db,
		actorContext,
	);

	return result.message;
}

export async function addInboundTicketMessage(
	input: AddTicketMessageInput,
	db: Db,
	actorContext?: SupportActorContext,
): Promise<SupportTicketMessageRow> {
	const result = await persistMessage(
		{
			authorKind: "inbound",
			ticketId: input.ticketId,
			organizationId: input.organizationId,
			authorUserId: input.authorUserId,
			body: input.body,
			channel: input.channel,
			isInternal: false,
			attachments: input.attachments,
			inboundMessageId: input.inboundMessageId,
		},
		db,
		actorContext,
	);

	return result.message;
}

export function listTicketMessages(
	ticketId: string,
	db: Db,
): Promise<SupportTicketMessageRow[]> {
	return listCustomerVisibleMessages(ticketId, db);
}

export async function getOperatorTicketThread(
	ticketId: string,
	organizationId: string,
	db: Db,
): Promise<OperatorTicketThread> {
	const ticket = await getTicket(ticketId, organizationId, db);
	const messages = await listOperatorMessages(ticketId, organizationId, db);
	return { ticket, messages };
}

export async function getCustomerTicketThread(
	ticketId: string,
	customerUserId: string,
	db: Db,
): Promise<CustomerTicketThread> {
	const ticket = await getCustomerTicket(ticketId, customerUserId, db);
	const messages = await listCustomerVisibleMessages(ticketId, db);
	return { ticket, messages };
}
