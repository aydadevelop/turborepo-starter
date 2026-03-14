import { SUPPORT_ERROR_CODES, SupportError } from "../shared/errors";
import {
	emitSupportTicketAssigned,
	emitSupportTicketCreated,
	emitSupportTicketStatusChanged,
} from "../shared/events";
import { buildTicketStatusPatch } from "../shared/status";
import type {
	AssignTicketInput,
	CreateSupportTicketInput,
	CustomerSupportTicketListInput,
	Db,
	ListOrgTicketsFilter,
	SupportActorContext,
	SupportTicketCollectionResult,
	SupportTicketListInput,
	SupportTicketRow,
	UpdateTicketDueAtInput,
	UpdateTicketPriorityInput,
	UpdateTicketStatusInput,
} from "../shared/types";
import {
	findTicketForCustomer,
	findTicketForOrganization,
	insertTicket,
	listCustomerOwnedTickets,
	listOrganizationTickets,
	updateTicket,
} from "./repository";

export async function createTicket(
	input: CreateSupportTicketInput,
	db: Db,
	actorContext?: SupportActorContext
): Promise<SupportTicketRow> {
	const row = await insertTicket(
		{
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
			metadata: input.metadata,
		},
		db
	);

	await emitSupportTicketCreated(actorContext, row);
	return row;
}

export function getTicket(
	ticketId: string,
	organizationId: string,
	db: Db
): Promise<SupportTicketRow> {
	return requireTicketForOrganization(ticketId, organizationId, db);
}

export function getCustomerTicket(
	ticketId: string,
	customerUserId: string,
	db: Db
): Promise<SupportTicketRow> {
	return requireTicketForCustomer(ticketId, customerUserId, db);
}

export function listOrgTickets(
	organizationId: string,
	input: SupportTicketListInput<ListOrgTicketsFilter>,
	db: Db
): Promise<SupportTicketCollectionResult> {
	return listOrganizationTickets(organizationId, input, db);
}

export function listCustomerTickets(
	customerUserId: string,
	input: CustomerSupportTicketListInput,
	db: Db
): Promise<SupportTicketCollectionResult> {
	return listCustomerOwnedTickets(customerUserId, input, db);
}

export async function assignTicket(
	input: AssignTicketInput,
	db: Db,
	actorContext?: SupportActorContext
): Promise<SupportTicketRow> {
	const current = await requireTicketForOrganization(
		input.ticketId,
		input.organizationId,
		db
	);

	if (current.assignedToUserId === input.assignedToUserId) {
		return current;
	}

	const updated = await updateTicket(
		input.ticketId,
		input.organizationId,
		{
			assignedToUserId: input.assignedToUserId,
		},
		db
	);

	if (!updated) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	await emitSupportTicketAssigned(actorContext, updated);
	return updated;
}

export async function updateTicketStatus(
	input: UpdateTicketStatusInput,
	db: Db,
	actorContext?: SupportActorContext
): Promise<SupportTicketRow> {
	const current = await requireTicketForOrganization(
		input.ticketId,
		input.organizationId,
		db
	);

	if (current.status === input.status) {
		return current;
	}

	const updated = await updateTicket(
		input.ticketId,
		input.organizationId,
		buildTicketStatusPatch(input.status, actorContext),
		db
	);

	if (!updated) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	await emitSupportTicketStatusChanged(actorContext, {
		organizationId: updated.organizationId,
		previousStatus: current.status,
		status: updated.status,
		ticketId: updated.id,
	});

	return updated;
}

export async function updateTicketPriority(
	input: UpdateTicketPriorityInput,
	db: Db
): Promise<SupportTicketRow> {
	const current = await requireTicketForOrganization(
		input.ticketId,
		input.organizationId,
		db
	);

	if (current.priority === input.priority) {
		return current;
	}

	const updated = await updateTicket(
		input.ticketId,
		input.organizationId,
		{
			priority: input.priority,
		},
		db
	);

	if (!updated) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	return updated;
}

export async function updateTicketDueAt(
	input: UpdateTicketDueAtInput,
	db: Db
): Promise<SupportTicketRow> {
	const current = await requireTicketForOrganization(
		input.ticketId,
		input.organizationId,
		db
	);

	const unchanged =
		current.dueAt?.toISOString() === input.dueAt?.toISOString() ||
		(current.dueAt === null && input.dueAt === null);
	if (unchanged) {
		return current;
	}

	const updated = await updateTicket(
		input.ticketId,
		input.organizationId,
		{
			dueAt: input.dueAt,
		},
		db
	);

	if (!updated) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	return updated;
}

export async function requireTicketForOrganization(
	ticketId: string,
	organizationId: string,
	db: Db
): Promise<SupportTicketRow> {
	const row = await findTicketForOrganization(ticketId, organizationId, db);
	if (!row) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	return row;
}

export async function requireTicketForCustomer(
	ticketId: string,
	customerUserId: string,
	db: Db
): Promise<SupportTicketRow> {
	const row = await findTicketForCustomer(ticketId, customerUserId, db);
	if (!row) {
		throw new SupportError(SUPPORT_ERROR_CODES.notFound);
	}

	return row;
}
