import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";

export const notificationChannelValues = [
	"in_app",
	"telegram",
	"vk",
	"max",
	"social", // legacy alias for telegram-like social delivery
	"email",
	"sms",
] as const;

export const notificationEventStatusValues = [
	"queued",
	"processing",
	"processed",
	"failed",
] as const;

export const notificationIntentStatusValues = [
	"pending",
	"filtered_out",
	"sent",
	"failed",
] as const;

export const notificationDeliveryStatusValues = [
	"queued",
	"sent",
	"failed",
] as const;

export const notificationSeverityValues = [
	"info",
	"success",
	"warning",
	"error",
] as const;

export type NotificationChannel = (typeof notificationChannelValues)[number];
export type NotificationEventStatus =
	(typeof notificationEventStatusValues)[number];
export type NotificationIntentStatus =
	(typeof notificationIntentStatusValues)[number];
export type NotificationDeliveryStatus =
	(typeof notificationDeliveryStatusValues)[number];
export type NotificationSeverity = (typeof notificationSeverityValues)[number];

export const notificationEvent = sqliteTable(
	"notification_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		eventType: text("event_type").notNull(),
		sourceType: text("source_type"),
		sourceId: text("source_id"),
		idempotencyKey: text("idempotency_key").notNull(),
		payload: text("payload").notNull(),
		status: text("status", { enum: notificationEventStatusValues })
			.notNull()
			.default("queued"),
		processingStartedAt: integer("processing_started_at", {
			mode: "timestamp_ms",
		}),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		failureReason: text("failure_reason"),
		...timestamps,
	},
	(table) => [
		index("notification_event_organizationId_idx").on(table.organizationId),
		index("notification_event_eventType_idx").on(table.eventType),
		index("notification_event_status_idx").on(table.status),
		index("notification_event_createdAt_idx").on(table.createdAt),
		uniqueIndex("notification_event_org_idempotency_unique").on(
			table.organizationId,
			table.idempotencyKey
		),
	]
);

export const notificationIntent = sqliteTable(
	"notification_intent",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => notificationEvent.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		recipientUserId: text("recipient_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		channel: text("channel", { enum: notificationChannelValues }).notNull(),
		templateKey: text("template_key").notNull(),
		title: text("title"),
		body: text("body"),
		metadata: text("metadata"),
		status: text("status", { enum: notificationIntentStatusValues })
			.notNull()
			.default("pending"),
		processedAt: integer("processed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("notification_intent_eventId_idx").on(table.eventId),
		index("notification_intent_organizationId_idx").on(table.organizationId),
		index("notification_intent_recipientUserId_idx").on(table.recipientUserId),
		index("notification_intent_channel_idx").on(table.channel),
		index("notification_intent_status_idx").on(table.status),
	]
);

export const notificationDelivery = sqliteTable(
	"notification_delivery",
	{
		id: text("id").primaryKey(),
		intentId: text("intent_id")
			.notNull()
			.references(() => notificationIntent.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		providerRecipient: text("provider_recipient"),
		attempt: integer("attempt").notNull().default(1),
		status: text("status", { enum: notificationDeliveryStatusValues })
			.notNull()
			.default("queued"),
		providerMessageId: text("provider_message_id"),
		failureReason: text("failure_reason"),
		responsePayload: text("response_payload"),
		sentAt: integer("sent_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("notification_delivery_intentId_idx").on(table.intentId),
		index("notification_delivery_organizationId_idx").on(table.organizationId),
		index("notification_delivery_provider_idx").on(table.provider),
		index("notification_delivery_status_idx").on(table.status),
		uniqueIndex("notification_delivery_intent_attempt_unique").on(
			table.intentId,
			table.attempt
		),
	]
);

export const notificationPreference = sqliteTable(
	"notification_preference",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		organizationScopeKey: text("organization_scope_key")
			.notNull()
			.default("global"),
		eventType: text("event_type").notNull(),
		channel: text("channel", { enum: notificationChannelValues }).notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		quietHoursStart: integer("quiet_hours_start"),
		quietHoursEnd: integer("quiet_hours_end"),
		timezone: text("timezone"),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("notification_preference_userId_idx").on(table.userId),
		index("notification_preference_organizationId_idx").on(
			table.organizationId
		),
		index("notification_preference_eventType_idx").on(table.eventType),
		uniqueIndex("notification_preference_scope_unique").on(
			table.userId,
			table.organizationScopeKey,
			table.eventType,
			table.channel
		),
	]
);

export const notificationInApp = sqliteTable(
	"notification_in_app",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id").references(() => notificationEvent.id, {
			onDelete: "set null",
		}),
		intentId: text("intent_id").references(() => notificationIntent.id, {
			onDelete: "set null",
		}),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		body: text("body"),
		ctaUrl: text("cta_url"),
		severity: text("severity", { enum: notificationSeverityValues })
			.notNull()
			.default("info"),
		metadata: text("metadata"),
		deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }).notNull(),
		viewedAt: integer("viewed_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("notification_in_app_eventId_idx").on(table.eventId),
		index("notification_in_app_intentId_idx").on(table.intentId),
		index("notification_in_app_organizationId_idx").on(table.organizationId),
		index("notification_in_app_userId_idx").on(table.userId),
		index("notification_in_app_viewedAt_idx").on(table.viewedAt),
		index("notification_in_app_deliveredAt_idx").on(table.deliveredAt),
	]
);
