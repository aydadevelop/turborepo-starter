import { index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const assistantChatVisibility = ["public", "private"] as const;
export const assistantChatVisibilityEnum = pgEnum(
	"assistant_chat_visibility",
	assistantChatVisibility,
);
export type AssistantChatVisibility = (typeof assistantChatVisibility)[number];

export const assistantChat = pgTable(
	"assistant_chat",
	{
		id: text("id").primaryKey(),
		title: text("title").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		visibility: assistantChatVisibilityEnum("visibility")
			.notNull()
			.default("private"),
		...timestamps,
	},
	(table) => [index("assistant_chat_user_idx").on(table.userId)],
);

export const assistantMessageRole = ["user", "assistant"] as const;
export const assistantMessageRoleEnum = pgEnum(
	"assistant_message_role",
	assistantMessageRole,
);
export type AssistantMessageRole = (typeof assistantMessageRole)[number];

export const assistantMessage = pgTable(
	"assistant_message",
	{
		id: text("id").primaryKey(),
		chatId: text("chat_id")
			.notNull()
			.references(() => assistantChat.id, { onDelete: "cascade" }),
		role: assistantMessageRoleEnum("role").notNull(),
		parts: jsonb("parts").$type<unknown[]>().notNull(),
		attachments: jsonb("attachments").$type<unknown[]>().notNull().default([]),
		...timestamps,
	},
	(table) => [index("assistant_message_chat_idx").on(table.chatId)],
);
