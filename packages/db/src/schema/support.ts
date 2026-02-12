import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { booking } from "./booking";
import { timestamps } from "./columns";

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
	"sputnik",
] as const;

export const supportMessageChannelValues = [
	"internal",
	"web",
	"telegram",
	"avito",
	"email",
	"sputnik",
] as const;

export const inboundMessageChannelValues = [
	"telegram",
	"avito",
	"email",
	"sputnik",
	"web",
] as const;

export const inboundMessageStatusValues = [
	"received",
	"deduplicated",
	"processed",
	"failed",
] as const;

export const telegramNotificationStatusValues = [
	"queued",
	"sent",
	"failed",
] as const;

export const telegramWebhookEventStatusValues = [
	"received",
	"processed",
	"failed",
] as const;

export type SupportTicketStatus = (typeof supportTicketStatusValues)[number];
export type SupportTicketPriority =
	(typeof supportTicketPriorityValues)[number];
export type SupportTicketSource = (typeof supportTicketSourceValues)[number];
export type SupportMessageChannel =
	(typeof supportMessageChannelValues)[number];
export type InboundMessageChannel =
	(typeof inboundMessageChannelValues)[number];
export type InboundMessageStatus = (typeof inboundMessageStatusValues)[number];
export type TelegramNotificationStatus =
	(typeof telegramNotificationStatusValues)[number];
export type TelegramWebhookEventStatus =
	(typeof telegramWebhookEventStatusValues)[number];

export const supportTicket = sqliteTable(
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
		source: text("source", { enum: supportTicketSourceValues })
			.notNull()
			.default("manual"),
		status: text("status", { enum: supportTicketStatusValues })
			.notNull()
			.default("open"),
		priority: text("priority", { enum: supportTicketPriorityValues })
			.notNull()
			.default("normal"),
		subject: text("subject").notNull(),
		description: text("description"),
		dueAt: integer("due_at", { mode: "timestamp_ms" }),
		resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
		closedAt: integer("closed_at", { mode: "timestamp_ms" }),
		metadata: text("metadata"),
		...timestamps,
	},
	(table) => [
		index("support_ticket_organizationId_idx").on(table.organizationId),
		index("support_ticket_status_idx").on(table.status),
		index("support_ticket_priority_idx").on(table.priority),
		index("support_ticket_assignedToUserId_idx").on(table.assignedToUserId),
		index("support_ticket_dueAt_idx").on(table.dueAt),
		index("support_ticket_bookingId_idx").on(table.bookingId),
	]
);

export const supportTicketMessage = sqliteTable(
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
		channel: text("channel", { enum: supportMessageChannelValues })
			.notNull()
			.default("internal"),
		body: text("body").notNull(),
		attachmentsJson: text("attachments_json"),
		isInternal: integer("is_internal", { mode: "boolean" })
			.notNull()
			.default(false),
		...timestamps,
	},
	(table) => [
		index("support_ticket_message_ticketId_idx").on(table.ticketId),
		index("support_ticket_message_organizationId_idx").on(table.organizationId),
		index("support_ticket_message_channel_idx").on(table.channel),
		index("support_ticket_message_createdAt_idx").on(table.createdAt),
	]
);

export const inboundMessage = sqliteTable(
	"inbound_message",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		ticketId: text("ticket_id").references(() => supportTicket.id, {
			onDelete: "set null",
		}),
		channel: text("channel", { enum: inboundMessageChannelValues }).notNull(),
		externalMessageId: text("external_message_id").notNull(),
		externalThreadId: text("external_thread_id"),
		externalSenderId: text("external_sender_id"),
		senderDisplayName: text("sender_display_name"),
		dedupeKey: text("dedupe_key").notNull(),
		normalizedText: text("normalized_text"),
		payload: text("payload").notNull(),
		status: text("status", { enum: inboundMessageStatusValues })
			.notNull()
			.default("received"),
		errorMessage: text("error_message"),
		receivedAt: integer("received_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("inbound_message_organizationId_idx").on(table.organizationId),
		index("inbound_message_ticketId_idx").on(table.ticketId),
		index("inbound_message_channel_idx").on(table.channel),
		index("inbound_message_status_idx").on(table.status),
		index("inbound_message_receivedAt_idx").on(table.receivedAt),
		uniqueIndex("inbound_message_channel_dedupe_unique").on(
			table.channel,
			table.dedupeKey
		),
	]
);

export const telegramNotification = sqliteTable(
	"telegram_notification",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		ticketId: text("ticket_id").references(() => supportTicket.id, {
			onDelete: "set null",
		}),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		templateKey: text("template_key").notNull(),
		recipientChatId: text("recipient_chat_id").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		payload: text("payload"),
		status: text("status", { enum: telegramNotificationStatusValues })
			.notNull()
			.default("queued"),
		providerMessageId: text("provider_message_id"),
		failureReason: text("failure_reason"),
		attemptCount: integer("attempt_count").notNull().default(0),
		sentAt: integer("sent_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("telegram_notification_organizationId_idx").on(table.organizationId),
		index("telegram_notification_ticketId_idx").on(table.ticketId),
		index("telegram_notification_status_idx").on(table.status),
		index("telegram_notification_recipientChatId_idx").on(
			table.recipientChatId
		),
		uniqueIndex("telegram_notification_org_idempotency_unique").on(
			table.organizationId,
			table.idempotencyKey
		),
	]
);

export const telegramWebhookEvent = sqliteTable(
	"telegram_webhook_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		inboundMessageId: text("inbound_message_id").references(
			() => inboundMessage.id,
			{
				onDelete: "set null",
			}
		),
		updateId: integer("update_id").notNull(),
		eventType: text("event_type").notNull(),
		chatId: text("chat_id"),
		payload: text("payload").notNull(),
		status: text("status", { enum: telegramWebhookEventStatusValues })
			.notNull()
			.default("received"),
		errorMessage: text("error_message"),
		receivedAt: integer("received_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("telegram_webhook_event_organizationId_idx").on(table.organizationId),
		index("telegram_webhook_event_inboundMessageId_idx").on(
			table.inboundMessageId
		),
		index("telegram_webhook_event_status_idx").on(table.status),
		index("telegram_webhook_event_chatId_idx").on(table.chatId),
		index("telegram_webhook_event_receivedAt_idx").on(table.receivedAt),
		uniqueIndex("telegram_webhook_event_updateId_unique").on(table.updateId),
	]
);
