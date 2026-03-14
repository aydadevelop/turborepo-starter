import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

export const systemRelations = defineRelationsPart(schema, (r) => ({
	assistantChat: {
		user: r.one.user({
			from: r.assistantChat.userId,
			to: r.user.id,
		}),
		messages: r.many.assistantMessage(),
	},

	assistantMessage: {
		chat: r.one.assistantChat({
			from: r.assistantMessage.chatId,
			to: r.assistantChat.id,
		}),
	},

	userConsent: {
		user: r.one.user({
			from: r.userConsent.userId,
			to: r.user.id,
		}),
	},
}));
