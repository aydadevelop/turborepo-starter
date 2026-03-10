import type { db } from "@my-app/db";
import type { supportTicket, supportTicketMessage } from "@my-app/db/schema/support";

export type Db = typeof db;
export type SupportTicketRow = typeof supportTicket.$inferSelect;
export type SupportTicketMessageRow = typeof supportTicketMessage.$inferSelect;

export interface CreateSupportTicketInput {
	organizationId: string;
	bookingId?: string;
	customerUserId?: string;
	createdByUserId?: string;
	subject: string;
	description?: string;
	priority?: "low" | "normal" | "high" | "urgent";
	source?: "manual" | "web" | "telegram" | "avito" | "email" | "api";
}

export interface AddTicketMessageInput {
	ticketId: string;
	organizationId: string;
	authorUserId?: string;
	channel?: "internal" | "web" | "telegram" | "avito" | "email" | "api";
	body: string;
	isInternal?: boolean;
}

export interface ListTicketsFilter {
	status?: "open" | "pending_customer" | "pending_operator" | "escalated" | "resolved" | "closed";
	bookingId?: string;
	limit?: number;
	offset?: number;
}
