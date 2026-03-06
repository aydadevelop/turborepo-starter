import type { ContaktlyIntent } from "@my-app/db/schema/contaktly";

import { listContaktlyConversationsForOrganization } from "./contaktly-conversations";
import { getContaktlyGoogleCalendarConnectionStatus } from "./contaktly-google-calendar";
import { getContaktlyWidgetAdminConfig } from "./contaktly-widget-config";

export interface ContaktlyMeetingQueueItem {
	conversationId: string;
	lastIntent: ContaktlyIntent;
	lastMessageText: string | null;
	slots: Record<string, string>;
	updatedAt: string;
	visitorId: string;
}

export interface ContaktlyMeetingPipeline {
	bookingUrl: string;
	calendar: Awaited<
		ReturnType<typeof getContaktlyGoogleCalendarConnectionStatus>
	>;
	configId: string;
	readyToBookConversations: ContaktlyMeetingQueueItem[];
}

export const getContaktlyMeetingPipeline = async ({
	configId,
	organizationId,
	userId,
}: {
	configId: string;
	organizationId: string;
	userId: string;
}): Promise<ContaktlyMeetingPipeline> => {
	const [widgetConfig, calendar, conversations] = await Promise.all([
		getContaktlyWidgetAdminConfig(configId, organizationId),
		getContaktlyGoogleCalendarConnectionStatus({
			configId,
			userId,
		}),
		listContaktlyConversationsForOrganization(organizationId),
	]);

	return {
		bookingUrl: widgetConfig.bookingUrl,
		calendar,
		configId,
		readyToBookConversations: conversations
			.filter(
				(conversation) =>
					conversation.configId === configId &&
					conversation.stage === "ready_to_book"
			)
			.map((conversation) => ({
				conversationId: conversation.conversationId,
				lastIntent: conversation.lastIntent,
				lastMessageText: conversation.lastMessageText,
				slots: conversation.slots,
				updatedAt: conversation.updatedAt,
				visitorId: conversation.visitorId,
			})),
	};
};
