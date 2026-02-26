import { db } from "@my-app/db";
import { member } from "@my-app/db/schema/auth";
import {
	type NotificationQueueProducer,
	notificationsPusher,
} from "@my-app/notifications/pusher";
import { eq } from "drizzle-orm";

const getOrgMemberUserIds = async (
	organizationId: string
): Promise<string[]> => {
	const rows = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, organizationId));
	return rows.map((r) => r.userId);
};

export const emitYtNotification = async (params: {
	organizationId: string;
	eventType: string;
	idempotencyKey: string;
	title: string;
	body?: string;
	ctaUrl?: string;
	severity?: "info" | "warning" | "error";
	notificationQueue?: NotificationQueueProducer;
}): Promise<void> => {
	try {
		const userIds = await getOrgMemberUserIds(params.organizationId);
		if (userIds.length === 0) {
			return;
		}

		await notificationsPusher({
			input: {
				organizationId: params.organizationId,
				eventType: params.eventType,
				idempotencyKey: params.idempotencyKey,
				payload: {
					recipients: userIds.map((userId) => ({
						userId,
						channels: ["in_app"] as ["in_app"],
						title: params.title,
						body: params.body,
						ctaUrl: params.ctaUrl,
						severity: params.severity ?? "info",
					})),
				},
			},
			queue: params.notificationQueue,
		});
	} catch (err) {
		console.error("[yt-notify] Failed to emit notification:", err);
	}
};
