import { db } from "@my-app/db";
import {
	type ContaktlyConversationMessage,
	type ContaktlyConversationSlots,
	type ContaktlyIntent,
	type ContaktlyPromptKey,
	type ContaktlyStage,
	contaktlyConversation,
} from "@my-app/db/schema/contaktly";
import { desc, eq } from "drizzle-orm";

export interface ContaktlyAdminConversationItem {
	activePromptKey: ContaktlyPromptKey;
	configId: string;
	conversationId: string;
	lastIntent: ContaktlyIntent;
	lastMessageText: string | null;
	messageCount: number;
	messages: ContaktlyConversationMessage[];
	slots: ContaktlyConversationSlots;
	stage: ContaktlyStage;
	updatedAt: string;
	visitorId: string;
}

const resolveConversationActivityTimestamp = (
	messages: ContaktlyConversationMessage[],
	updatedAt: Date
) => {
	const lastMessageCreatedAt = messages.at(-1)?.createdAt;
	if (!lastMessageCreatedAt) {
		return updatedAt.getTime();
	}

	const parsed = Date.parse(lastMessageCreatedAt);
	return Number.isNaN(parsed) ? updatedAt.getTime() : parsed;
};

export const listContaktlyConversationsForOrganization = async (
	organizationId: string
): Promise<ContaktlyAdminConversationItem[]> => {
	const rows = await db
		.select({
			id: contaktlyConversation.id,
			configId: contaktlyConversation.configId,
			visitorId: contaktlyConversation.visitorId,
			activePromptKey: contaktlyConversation.activePromptKey,
			lastIntent: contaktlyConversation.lastIntent,
			stage: contaktlyConversation.stage,
			slots: contaktlyConversation.slots,
			messages: contaktlyConversation.messages,
			updatedAt: contaktlyConversation.updatedAt,
		})
		.from(contaktlyConversation)
		.where(eq(contaktlyConversation.organizationId, organizationId))
		.orderBy(desc(contaktlyConversation.updatedAt));

	return rows
		.sort((left, right) => {
			const activityDelta =
				resolveConversationActivityTimestamp(right.messages, right.updatedAt) -
				resolveConversationActivityTimestamp(left.messages, left.updatedAt);
			if (activityDelta !== 0) {
				return activityDelta;
			}

			const updatedAtDelta =
				right.updatedAt.getTime() - left.updatedAt.getTime();
			if (updatedAtDelta !== 0) {
				return updatedAtDelta;
			}

			return left.id.localeCompare(right.id);
		})
		.map((row) => ({
			activePromptKey: row.activePromptKey,
			configId: row.configId,
			conversationId: row.id,
			lastIntent: row.lastIntent,
			lastMessageText: row.messages.at(-1)?.text ?? null,
			messageCount: row.messages.length,
			messages: row.messages,
			slots: row.slots,
			stage: row.stage,
			updatedAt: row.updatedAt.toISOString(),
			visitorId: row.visitorId,
		}));
};
