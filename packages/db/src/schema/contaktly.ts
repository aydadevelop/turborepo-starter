import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { timestamps } from "./columns";

export const contaktlyMessageRoleValues = ["assistant", "user"] as const;
export type ContaktlyMessageRole = (typeof contaktlyMessageRoleValues)[number];

export const contaktlyIntentValues = [
	"website-redesign",
	"messaging",
	"lead-generation",
	"pricing",
	"general",
] as const;
export type ContaktlyIntent = (typeof contaktlyIntentValues)[number];

export const contaktlyPromptKeyValues = [
	"pain_point",
	"audience",
	"channel",
	"timeline",
	"goal",
] as const;
export type ContaktlyPromptKey = (typeof contaktlyPromptKeyValues)[number];

export const contaktlyStageValues = ["qualification", "ready_to_book"] as const;
export type ContaktlyStage = (typeof contaktlyStageValues)[number];
export type ContaktlyConversationSlots = Partial<
	Record<ContaktlyPromptKey, string>
>;
export interface ContaktlyWidgetTheme {
	accentColor: string;
	backgroundColor: string;
}

export interface ContaktlyConversationMessage {
	createdAt: string;
	id: string;
	intent?: ContaktlyIntent;
	promptKey?: ContaktlyPromptKey;
	role: ContaktlyMessageRole;
	text: string;
}

export const contaktlyCalendarProviderValues = ["google"] as const;
export type ContaktlyCalendarProvider =
	(typeof contaktlyCalendarProviderValues)[number];

export const contaktlyPrefillDraft = pgTable(
	"contaktly_prefill_draft",
	{
		id: text("id").primaryKey(),
		publicConfigId: text("public_config_id").notNull(),
		sourceUrl: text("source_url").notNull(),
		siteTitle: text("site_title").notNull(),
		businessSummary: text("business_summary").notNull(),
		openingMessage: text("opening_message").notNull(),
		starterCards: jsonb("starter_cards").$type<string[]>().notNull(),
		customInstructions: text("custom_instructions").notNull(),
		qualifiedLeadDefinition: text("qualified_lead_definition").notNull(),
		...timestamps,
	},
	(table) => [
		index("contaktly_prefill_draft_publicConfigId_idx").on(
			table.publicConfigId
		),
		uniqueIndex("contaktly_prefill_draft_publicConfigId_unique").on(
			table.publicConfigId
		),
	]
);

export const contaktlyWorkspaceConfig = pgTable(
	"contaktly_workspace_config",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "cascade",
		}),
		publicConfigId: text("public_config_id").notNull(),
		bookingUrl: text("booking_url"),
		allowedDomains: jsonb("allowed_domains").$type<string[]>(),
		botName: text("bot_name"),
		openingMessage: text("opening_message"),
		starterCards: jsonb("starter_cards").$type<string[]>(),
		theme: jsonb("theme").$type<ContaktlyWidgetTheme>(),
		...timestamps,
	},
	(table) => [
		index("contaktly_workspace_config_organizationId_idx").on(
			table.organizationId
		),
		index("contaktly_workspace_config_publicConfigId_idx").on(
			table.publicConfigId
		),
		uniqueIndex("contaktly_workspace_config_organizationId_unique").on(
			table.organizationId
		),
		uniqueIndex("contaktly_workspace_config_publicConfigId_unique").on(
			table.publicConfigId
		),
	]
);

export const contaktlyCalendarConnection = pgTable(
	"contaktly_calendar_connection",
	{
		id: text("id").primaryKey(),
		publicConfigId: text("public_config_id").notNull(),
		provider: text("provider", {
			enum: contaktlyCalendarProviderValues,
		})
			.notNull()
			.default("google"),
		providerAccountId: text("provider_account_id").notNull(),
		connectedUserId: text("connected_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accountEmail: text("account_email"),
		calendarId: text("calendar_id").notNull().default("primary"),
		scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
		...timestamps,
	},
	(table) => [
		index("contaktly_calendar_connection_publicConfigId_idx").on(
			table.publicConfigId
		),
		index("contaktly_calendar_connection_connectedUserId_idx").on(
			table.connectedUserId
		),
		uniqueIndex("contaktly_calendar_connection_publicConfigId_unique").on(
			table.publicConfigId
		),
	]
);

export const contaktlyTurn = pgTable(
	"contaktly_turn",
	{
		id: text("id").primaryKey(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => contaktlyConversation.id, { onDelete: "cascade" }),
		clientTurnId: text("client_turn_id").notNull(),
		stateVersionBefore: integer("state_version_before").notNull(),
		stateVersionAfter: integer("state_version_after").notNull(),
		userInput: text("user_input").notNull(),
		...timestamps,
	},
	(table) => [
		index("contaktly_turn_conversationId_idx").on(table.conversationId),
		index("contaktly_turn_clientTurnId_idx").on(table.clientTurnId),
		uniqueIndex("contaktly_turn_conversation_state_after_unique").on(
			table.conversationId,
			table.stateVersionAfter
		),
		uniqueIndex("contaktly_turn_conversation_client_turn_unique").on(
			table.conversationId,
			table.clientTurnId
		),
	]
);

export const contaktlyMessage = pgTable(
	"contaktly_message",
	{
		id: text("id").primaryKey(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => contaktlyConversation.id, { onDelete: "cascade" }),
		turnId: text("turn_id").references(() => contaktlyTurn.id, {
			onDelete: "set null",
		}),
		messageOrder: integer("message_order").notNull(),
		role: text("role", { enum: contaktlyMessageRoleValues }).notNull(),
		text: text("text").notNull(),
		intent: text("intent", { enum: contaktlyIntentValues }),
		promptKey: text("prompt_key", { enum: contaktlyPromptKeyValues }),
		...timestamps,
	},
	(table) => [
		index("contaktly_message_conversationId_idx").on(table.conversationId),
		index("contaktly_message_turnId_idx").on(table.turnId),
		index("contaktly_message_order_idx").on(
			table.conversationId,
			table.messageOrder
		),
		uniqueIndex("contaktly_message_conversation_order_unique").on(
			table.conversationId,
			table.messageOrder
		),
	]
);

export const contaktlyConversation = pgTable(
	"contaktly_conversation",
	{
		id: text("id").primaryKey(),
		configId: text("config_id").notNull(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		visitorId: text("visitor_id").notNull(),
		lastWidgetInstanceId: text("last_widget_instance_id").notNull(),
		activePromptKey: text("active_prompt_key", {
			enum: contaktlyPromptKeyValues,
		})
			.notNull()
			.default("goal"),
		lastIntent: text("last_intent", { enum: contaktlyIntentValues })
			.notNull()
			.default("general"),
		stage: text("stage", { enum: contaktlyStageValues })
			.notNull()
			.default("qualification"),
		stateVersion: integer("state_version").notNull().default(0),
		nextMessageOrder: integer("next_message_order").notNull().default(1),
		slots: jsonb("slots")
			.$type<ContaktlyConversationSlots>()
			.notNull()
			.default({}),
		messages: jsonb("messages")
			.$type<ContaktlyConversationMessage[]>()
			.notNull()
			.default([]),
		...timestamps,
	},
	(table) => [
		index("contaktly_conversation_configId_idx").on(table.configId),
		index("contaktly_conversation_organizationId_idx").on(table.organizationId),
		index("contaktly_conversation_visitorId_idx").on(table.visitorId),
		index("contaktly_conversation_updatedAt_idx").on(table.updatedAt),
		uniqueIndex("contaktly_conversation_config_visitor_unique").on(
			table.configId,
			table.visitorId
		),
	]
);
