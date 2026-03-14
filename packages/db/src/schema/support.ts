import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";
import { booking } from "./marketplace";

/**
 * Support / Ticket system.
 *
 * Multi-channel ticket system with role-based escalation, inbound message
 * deduplication, and outbound channel dispatch. Designed to integrate with
 * external channels (Telegram, Avito, email, etc.) while keeping a unified
 * internal conversation timeline per ticket.
 *
 * Key flows:
 * 1. Inbound: external message → inboundMessage → linked to ticket → supportTicketMessage
 * 2. Outbound: operator writes reply → supportTicketMessage (channel-tagged) → dispatched
 * 3. Internal: notes visible only to staff → supportTicketMessage (isInternal = true)
 * 4. Escalation: ticket status transitions with assignment changes
 */

export const supportTicketStatusValues = [
	"open",
	"pending_customer",
	"pending_operator",
	"escalated",
	"resolved",
	"closed",
] as const;

export const supportTicketPriorityValues = [
	"low",
	"normal",
	"high",
	"urgent",
] as const;

export const supportTicketSourceValues = [
	"manual",
	"web",
	"telegram",
	"avito",
	"email",
	"api",
] as const;

export const supportMessageChannelValues = [
	"internal",
	"web",
	"telegram",
	"avito",
	"email",
	"api",
] as const;

export const inboundMessageChannelValues = [
	"telegram",
	"avito",
	"email",
	"web",
	"api",
] as const;

export const inboundMessageStatusValues = [
	"received",
	"deduplicated",
	"processed",
	"failed",
] as const;

export const supportTicketStatusEnum = pgEnum(
	"support_ticket_status",
	supportTicketStatusValues,
);
export const supportTicketPriorityEnum = pgEnum(
	"support_ticket_priority",
	supportTicketPriorityValues,
);
export const supportTicketSourceEnum = pgEnum(
	"support_ticket_source",
	supportTicketSourceValues,
);
export const supportMessageChannelEnum = pgEnum(
	"support_message_channel",
	supportMessageChannelValues,
);
export const inboundMessageChannelEnum = pgEnum(
	"inbound_message_channel",
	inboundMessageChannelValues,
);
export const inboundMessageStatusEnum = pgEnum(
	"inbound_message_status",
	inboundMessageStatusValues,
);

/**
 * Support ticket — a conversation thread tied to an organization,
 * optionally linked to a booking. Supports assignment, escalation, and priority.
 */
export const supportTicket = pgTable(
	"support_ticket",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		bookingId: text("booking_id").references(() => booking.id, {
			onDelete: "set null",
		}),
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		assignedToUserId: text("assigned_to_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		closedByUserId: text("closed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		source: supportTicketSourceEnum("source").notNull().default("manual"),
		status: supportTicketStatusEnum("status").notNull().default("open"),
		priority: supportTicketPriorityEnum("priority").notNull().default("normal"),
		subject: text("subject").notNull(),
		description: text("description"),
		dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
		resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
		closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(table) => [
		index("support_ticket_ix_organization_id").on(table.organizationId),
		index("support_ticket_ix_status").on(table.status),
		index("support_ticket_ix_priority").on(table.priority),
		index("support_ticket_ix_assigned_to_user_id").on(table.assignedToUserId),
		index("support_ticket_ix_due_at").on(table.dueAt),
		index("support_ticket_ix_booking_id").on(table.bookingId),
		index("support_ticket_ix_customer_user_id").on(table.customerUserId),
	],
);

/**
 * Message within a support ticket. Unified timeline for:
 * - Internal notes (isInternal = true, channel = "internal")
 * - Customer-facing messages (channel = source channel)
 * - Operator replies tagged to a specific outbound channel
 */
export const supportTicketMessage = pgTable(
	"support_ticket_message",
	{
		id: text("id").primaryKey(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => supportTicket.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		/** Link to the inbound message that generated this ticket message (if any). */
		inboundMessageId: text("inbound_message_id").references(
			() => inboundMessage.id,
			{ onDelete: "set null" },
		),
		channel: supportMessageChannelEnum("channel").notNull().default("internal"),
		body: text("body").notNull(),
		attachments:
			jsonb("attachments").$type<
				Array<{ name: string; url: string; mimeType?: string }>
			>(),
		isInternal: boolean("is_internal").notNull().default(false),
		...timestamps,
	},
	(table) => [
		index("support_ticket_message_ix_ticket_id").on(table.ticketId),
		index("support_ticket_message_ix_organization_id").on(table.organizationId),
		index("support_ticket_message_ix_inbound_message_id").on(
			table.inboundMessageId,
		),
		index("support_ticket_message_ix_channel").on(table.channel),
		index("support_ticket_message_ix_created_at").on(table.createdAt),
	],
);

/**
 * Inbound message from external channels. Deduplicated by (channel, dedupeKey).
 * Once processed, linked to a ticket (auto-created or matched to existing thread).
 */
export const inboundMessage = pgTable(
	"inbound_message",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		ticketId: text("ticket_id").references(() => supportTicket.id, {
			onDelete: "set null",
		}),
		channel: inboundMessageChannelEnum("channel").notNull(),
		externalMessageId: text("external_message_id").notNull(),
		externalThreadId: text("external_thread_id"),
		externalSenderId: text("external_sender_id"),
		senderDisplayName: text("sender_display_name"),
		dedupeKey: text("dedupe_key").notNull(),
		normalizedText: text("normalized_text"),
		payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
		status: inboundMessageStatusEnum("status").notNull().default("received"),
		errorMessage: text("error_message"),
		receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
			.default(sql`now()`)
			.notNull(),
		processedAt: timestamp("processed_at", {
			withTimezone: true,
			mode: "date",
		}),
		...timestamps,
	},
	(table) => [
		index("inbound_message_ix_organization_id").on(table.organizationId),
		index("inbound_message_ix_ticket_id").on(table.ticketId),
		index("inbound_message_ix_channel").on(table.channel),
		index("inbound_message_ix_status").on(table.status),
		index("inbound_message_ix_received_at").on(table.receivedAt),
		uniqueIndex("inbound_message_uq_channel_dedupe").on(
			table.channel,
			table.dedupeKey,
		),
	],
);
