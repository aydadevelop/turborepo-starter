import { db } from "@full-stack-cf-app/db";
import { telegramNotification } from "@full-stack-cf-app/db/schema/support";
import { env } from "@full-stack-cf-app/env/server";
import {
	legacyNotificationQueueMessageSchema,
	notificationQueueMessageSchema,
} from "@full-stack-cf-app/notifications/contracts";
import { NotificationProcessorService } from "@full-stack-cf-app/notifications/processor";
import { and, eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 5;
const MAX_LEGACY_TELEGRAM_ATTEMPTS = 4;
const TELEGRAM_API_BASE_URL_DEFAULT = "https://api.telegram.org";

const processor = new NotificationProcessorService();

const isLocalRuntime = () => {
	try {
		const hostname = new URL(env.BETTER_AUTH_URL).hostname.toLowerCase();
		return (
			hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
		);
	} catch {
		return false;
	}
};

const toTelegramText = (params: {
	templateKey: string;
	payload: string | null;
}) => {
	if (!params.payload || params.payload.trim().length === 0) {
		return params.templateKey;
	}

	try {
		const parsed = JSON.parse(params.payload) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const lines = Object.entries(parsed as Record<string, unknown>)
				.slice(0, 12)
				.map(([key, value]) => `${key}: ${String(value)}`);
			return `${params.templateKey}\n${lines.join("\n")}`.slice(0, 4000);
		}
	} catch {
		// ignore JSON parse errors and fallback to raw payload
	}

	return `${params.templateKey}\n${params.payload}`.slice(0, 4000);
};

const sendTelegramMessage = async (params: {
	chatId: string;
	text: string;
	notificationId: string;
}) => {
	const telegramToken = env.TELEGRAM_BOT_TOKEN;
	if (!telegramToken) {
		if (isLocalRuntime()) {
			return `mock-${params.notificationId}`;
		}

		throw new Error("TELEGRAM_BOT_TOKEN is not configured");
	}

	const telegramApiBaseUrl =
		env.TELEGRAM_BOT_API_BASE_URL || TELEGRAM_API_BASE_URL_DEFAULT;
	const response = await fetch(
		`${telegramApiBaseUrl}/bot${telegramToken}/sendMessage`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				chat_id: params.chatId,
				text: params.text,
			}),
		}
	);

	if (!response.ok) {
		throw new Error(`Telegram API returned HTTP ${response.status}`);
	}

	const responseJson = (await response.json()) as {
		ok?: boolean;
		description?: string;
		result?: {
			message_id?: number | string;
		};
	};
	if (!responseJson.ok) {
		throw new Error(
			responseJson.description || "Telegram API rejected message"
		);
	}

	return String(
		responseJson.result?.message_id ?? `telegram-${params.notificationId}`
	);
};

const handleLegacyTelegramDispatch = async (
	queueMessage: Message,
	input: {
		notificationId: string;
		organizationId: string;
	}
) => {
	const [notification] = await db
		.select()
		.from(telegramNotification)
		.where(
			and(
				eq(telegramNotification.id, input.notificationId),
				eq(telegramNotification.organizationId, input.organizationId)
			)
		)
		.limit(1);

	if (!notification || notification.status === "sent") {
		queueMessage.ack();
		return;
	}

	try {
		const providerMessageId = await sendTelegramMessage({
			chatId: notification.recipientChatId,
			text: toTelegramText({
				templateKey: notification.templateKey,
				payload: notification.payload,
			}),
			notificationId: notification.id,
		});
		await db
			.update(telegramNotification)
			.set({
				status: "sent",
				providerMessageId,
				failureReason: null,
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(telegramNotification.id, notification.id));
		queueMessage.ack();
	} catch (error) {
		const nextAttemptCount = notification.attemptCount + 1;
		await db
			.update(telegramNotification)
			.set({
				status: "failed",
				attemptCount: nextAttemptCount,
				failureReason:
					error instanceof Error
						? error.message.slice(0, 2000)
						: "Telegram dispatch failed",
				updatedAt: new Date(),
			})
			.where(eq(telegramNotification.id, notification.id));

		if (
			nextAttemptCount < MAX_LEGACY_TELEGRAM_ATTEMPTS &&
			queueMessage.attempts < MAX_RETRY_ATTEMPTS
		) {
			queueMessage.retry({
				delaySeconds: Math.min(nextAttemptCount * 30, 300),
			});
			return;
		}

		queueMessage.ack();
	}
};

const handleEventQueueMessage = async (
	queueMessage: Message,
	eventId: string
) => {
	const result = await processor.processEventById(eventId);
	if (result.status === "processed" || result.status === "already_processed") {
		queueMessage.ack();
		return;
	}

	if (result.status === "not_found" && queueMessage.attempts < 3) {
		queueMessage.retry({ delaySeconds: 15 });
		return;
	}

	if (
		result.status === "failed" &&
		result.reason === "exception" &&
		queueMessage.attempts < MAX_RETRY_ATTEMPTS
	) {
		queueMessage.retry({
			delaySeconds: Math.min(queueMessage.attempts * 30, 300),
		});
		return;
	}

	queueMessage.ack();
};

export const processNotificationBatch = async (
	batch: MessageBatch<unknown>
) => {
	for (const queueMessage of batch.messages) {
		const eventMessage = notificationQueueMessageSchema.safeParse(
			queueMessage.body
		);
		if (eventMessage.success) {
			await handleEventQueueMessage(queueMessage, eventMessage.data.eventId);
			continue;
		}

		const legacyMessage = legacyNotificationQueueMessageSchema.safeParse(
			queueMessage.body
		);
		if (
			legacyMessage.success &&
			legacyMessage.data.kind === "telegram.notification.dispatch.v1"
		) {
			await handleLegacyTelegramDispatch(queueMessage, {
				notificationId: legacyMessage.data.notificationId,
				organizationId: legacyMessage.data.organizationId,
			});
			continue;
		}

		console.error("Unknown notification queue message", queueMessage.body);
		queueMessage.ack();
	}
};
