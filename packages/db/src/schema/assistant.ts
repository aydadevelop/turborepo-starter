import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { timestamps } from "./columns";

export const assistantChatVisibility = ["public", "private"] as const;
export type AssistantChatVisibility = (typeof assistantChatVisibility)[number];

export const assistantChat = sqliteTable(
	"assistant_chat",
	{
		id: text("id").primaryKey(),
		title: text("title").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		visibility: text("visibility", { enum: assistantChatVisibility })
			.notNull()
			.default("private"),
		...timestamps,
	},
	(table) => [index("assistant_chat_user_idx").on(table.userId)]
);

export const assistantMessageRole = ["user", "assistant"] as const;
export type AssistantMessageRole = (typeof assistantMessageRole)[number];

export const assistantMessage = sqliteTable(
	"assistant_message",
	{
		id: text("id").primaryKey(),
		chatId: text("chat_id")
			.notNull()
			.references(() => assistantChat.id, { onDelete: "cascade" }),
		role: text("role", { enum: assistantMessageRole }).notNull(),
		parts: text("parts", { mode: "json" }).$type<unknown[]>().notNull(),
		attachments: text("attachments", { mode: "json" })
			.$type<unknown[]>()
			.notNull()
			.default([]),
		...timestamps,
	},
	(table) => [index("assistant_message_chat_idx").on(table.chatId)]
);
