import type { db } from "@my-app/db";
import type {
	supportTicket,
	supportTicketMessage,
} from "@my-app/db/schema/support";

export type Db = typeof db;
export type SupportTicketRow = typeof supportTicket.$inferSelect;
export type SupportTicketMessageRow = typeof supportTicketMessage.$inferSelect;

export interface CreateSupportTicketInput {
	bookingId?: string;
	createdByUserId?: string;
	customerUserId?: string;
	description?: string;
	organizationId: string;
	priority?: "low" | "normal" | "high" | "urgent";
	source?: "manual" | "web" | "telegram" | "avito" | "email" | "api";
	subject: string;
}

export interface AddTicketMessageInput {
	authorUserId?: string;
	body: string;
	channel?: "internal" | "web" | "telegram" | "avito" | "email" | "api";
	isInternal?: boolean;
	organizationId: string;
	ticketId: string;
}

export interface ListTicketsFilter {
	bookingId?: string;
	limit?: number;
	offset?: number;
	status?:
		| "open"
		| "pending_customer"
		| "pending_operator"
		| "escalated"
		| "resolved"
		| "closed";
}
