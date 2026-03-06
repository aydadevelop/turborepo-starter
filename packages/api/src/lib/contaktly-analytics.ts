import { db } from "@my-app/db";
import {
	type ContaktlyIntent,
	contaktlyCalendarConnection,
	contaktlyConversation,
	contaktlyPrefillDraft,
	contaktlyWorkspaceConfig,
} from "@my-app/db/schema/contaktly";
import { desc, eq, inArray } from "drizzle-orm";

export interface ContaktlyAnalyticsConversationPreview {
	conversationId: string;
	lastIntent: ContaktlyIntent;
	lastMessageText: string | null;
	stage: "qualification" | "ready_to_book";
	updatedAt: string;
	visitorId: string;
}

export interface ContaktlyAnalyticsSummary {
	averageMessagesPerConversation: number;
	calendarConnected: boolean;
	configId: string;
	hasPrefillDraft: boolean;
	intentBreakdown: Array<{
		count: number;
		intent: ContaktlyIntent;
	}>;
	lastUpdatedAt: string | null;
	qualificationRate: number;
	readyToBookConversations: number;
	recentConversations: ContaktlyAnalyticsConversationPreview[];
	totalConversations: number;
	totalMessages: number;
}

const roundToSingleDecimal = (value: number) => Math.round(value * 10) / 10;

export const getContaktlyAnalyticsSummary = async (
	organizationId: string,
	configId?: string
): Promise<ContaktlyAnalyticsSummary> => {
	const workspaceConfigs = await db
		.select({
			publicConfigId: contaktlyWorkspaceConfig.publicConfigId,
		})
		.from(contaktlyWorkspaceConfig)
		.where(eq(contaktlyWorkspaceConfig.organizationId, organizationId));

	const availableConfigIds = workspaceConfigs.map(
		(workspaceConfig) => workspaceConfig.publicConfigId
	);
	const targetConfigId =
		configId ?? availableConfigIds[0] ?? "ctly-demo-founder";
	const scopedConfigIds = configId ? [configId] : availableConfigIds;

	const conversations =
		scopedConfigIds.length === 0
			? []
			: await db
					.select({
						id: contaktlyConversation.id,
						configId: contaktlyConversation.configId,
						visitorId: contaktlyConversation.visitorId,
						lastIntent: contaktlyConversation.lastIntent,
						stage: contaktlyConversation.stage,
						messages: contaktlyConversation.messages,
						updatedAt: contaktlyConversation.updatedAt,
					})
					.from(contaktlyConversation)
					.where(inArray(contaktlyConversation.configId, scopedConfigIds))
					.orderBy(desc(contaktlyConversation.updatedAt));

	const [calendarConnections, prefillDrafts] =
		scopedConfigIds.length === 0
			? [[], []]
			: await Promise.all([
					db
						.select({
							publicConfigId: contaktlyCalendarConnection.publicConfigId,
						})
						.from(contaktlyCalendarConnection)
						.where(
							inArray(
								contaktlyCalendarConnection.publicConfigId,
								scopedConfigIds
							)
						),
					db
						.select({
							publicConfigId: contaktlyPrefillDraft.publicConfigId,
						})
						.from(contaktlyPrefillDraft)
						.where(
							inArray(contaktlyPrefillDraft.publicConfigId, scopedConfigIds)
						),
				]);

	const totalConversations = conversations.length;
	const readyToBookConversations = conversations.filter(
		(conversation) => conversation.stage === "ready_to_book"
	).length;
	const totalMessages = conversations.reduce(
		(total, conversation) => total + conversation.messages.length,
		0
	);
	const qualificationRate =
		totalConversations === 0
			? 0
			: Math.round((readyToBookConversations / totalConversations) * 100);
	const averageMessagesPerConversation =
		totalConversations === 0
			? 0
			: roundToSingleDecimal(totalMessages / totalConversations);

	const intentCounts = new Map<ContaktlyIntent, number>();

	for (const conversation of conversations) {
		intentCounts.set(
			conversation.lastIntent,
			(intentCounts.get(conversation.lastIntent) ?? 0) + 1
		);
	}

	return {
		averageMessagesPerConversation,
		calendarConnected: calendarConnections.length > 0,
		configId: targetConfigId,
		hasPrefillDraft: prefillDrafts.length > 0,
		intentBreakdown: [...intentCounts.entries()]
			.map(([intent, count]) => ({ intent, count }))
			.sort(
				(left, right) =>
					right.count - left.count || left.intent.localeCompare(right.intent)
			),
		lastUpdatedAt: conversations[0]?.updatedAt.toISOString() ?? null,
		qualificationRate,
		readyToBookConversations,
		recentConversations: conversations.slice(0, 5).map((conversation) => ({
			conversationId: conversation.id,
			lastIntent: conversation.lastIntent,
			lastMessageText: conversation.messages.at(-1)?.text ?? null,
			stage: conversation.stage,
			updatedAt: conversation.updatedAt.toISOString(),
			visitorId: conversation.visitorId,
		})),
		totalConversations,
		totalMessages,
	};
};
