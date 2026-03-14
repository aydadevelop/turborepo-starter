import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

export const supportRelations = defineRelationsPart(schema, (r) => ({
	supportTicket: {
		organization: r.one.organization({
			from: r.supportTicket.organizationId,
			to: r.organization.id,
		}),
		booking: r.one.booking({
			from: r.supportTicket.bookingId,
			to: r.booking.id,
		}),
		customerUser: r.one.user({
			from: r.supportTicket.customerUserId,
			to: r.user.id,
			alias: "ticket_customer",
		}),
		createdByUser: r.one.user({
			from: r.supportTicket.createdByUserId,
			to: r.user.id,
			alias: "ticket_creator",
		}),
		assignedToUser: r.one.user({
			from: r.supportTicket.assignedToUserId,
			to: r.user.id,
			alias: "ticket_assignee",
		}),
		resolvedByUser: r.one.user({
			from: r.supportTicket.resolvedByUserId,
			to: r.user.id,
			alias: "ticket_resolver",
		}),
		closedByUser: r.one.user({
			from: r.supportTicket.closedByUserId,
			to: r.user.id,
			alias: "ticket_closer",
		}),
		messages: r.many.supportTicketMessage(),
		inboundMessages: r.many.inboundMessage(),
	},

	supportTicketMessage: {
		ticket: r.one.supportTicket({
			from: r.supportTicketMessage.ticketId,
			to: r.supportTicket.id,
		}),
		organization: r.one.organization({
			from: r.supportTicketMessage.organizationId,
			to: r.organization.id,
		}),
		authorUser: r.one.user({
			from: r.supportTicketMessage.authorUserId,
			to: r.user.id,
			alias: "ticket_message_author",
		}),
		inboundMessage: r.one.inboundMessage({
			from: r.supportTicketMessage.inboundMessageId,
			to: r.inboundMessage.id,
		}),
	},

	inboundMessage: {
		organization: r.one.organization({
			from: r.inboundMessage.organizationId,
			to: r.organization.id,
		}),
		ticket: r.one.supportTicket({
			from: r.inboundMessage.ticketId,
			to: r.supportTicket.id,
		}),
		ticketMessages: r.many.supportTicketMessage(),
	},
}));
