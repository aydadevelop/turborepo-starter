import { db } from "@my-app/db";
import {
	type NotificationChannel,
	notificationDelivery,
	notificationEvent,
	notificationInApp,
	notificationIntent,
} from "@my-app/db/schema/notification";
import { env } from "@my-app/env/server";
import { eq } from "drizzle-orm";

import {
	type NotificationRecipient,
	notificationEventPayloadSchema,
} from "./contracts";
import {
	DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
	EmailNotificationProvider,
} from "./email";
import { PreferenceController } from "./preferences";

const TELEGRAM_API_BASE_URL_DEFAULT = "https://api.telegram.org";

const isLocalRuntime = () => {
	try {
		const hostname = new URL(env.SERVER_URL).hostname.toLowerCase();
		return (
			hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
		);
	} catch {
		return false;
	}
};

const buildIntentDisplayTitle = (
	eventType: string,
	recipient: NotificationRecipient
) => {
	return recipient.title.trim() || eventType;
};

const buildIntentDisplayBody = (recipient: NotificationRecipient) => {
	const body = recipient.body?.trim();
	return body && body.length > 0 ? body : null;
};

const toFailureReason = (error: unknown) => {
	if (error instanceof Error) {
		return error.message.slice(0, 2000);
	}
	return "Notification processing failed";
};

export interface NotificationProviderResult {
	failureReason?: string;
	providerMessageId?: string;
	providerRecipient?: string;
	responsePayload?: string;
	status: "sent" | "failed";
}

export interface NotificationProvider {
	channel: NotificationChannel;
	name: string;
	send(params: {
		event: typeof notificationEvent.$inferSelect;
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult>;
}

export class InAppNotificationProvider implements NotificationProvider {
	channel: NotificationChannel = "in_app";
	name = "in_app";

	async send(params: {
		event: typeof notificationEvent.$inferSelect;
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult> {
		const inAppNotificationId = crypto.randomUUID();
		await db.insert(notificationInApp).values({
			id: inAppNotificationId,
			eventId: params.event.id,
			intentId: params.intentId,
			organizationId: params.event.organizationId,
			userId: params.recipient.userId,
			title: buildIntentDisplayTitle(params.event.eventType, params.recipient),
			body: buildIntentDisplayBody(params.recipient),
			ctaUrl: params.recipient.ctaUrl,
			severity: params.recipient.severity,
			metadata: params.recipient.metadata ?? null,
			deliveredAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		return {
			status: "sent",
			providerMessageId: inAppNotificationId,
		};
	}
}

export class TelegramProvider implements NotificationProvider {
	channel: NotificationChannel = "telegram";
	name = "telegram";

	async send(params: {
		event: typeof notificationEvent.$inferSelect;
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult> {
		const chatId = String(
			params.recipient.metadata?.telegramChatId ?? ""
		).trim();
		if (!chatId) {
			return {
				status: "failed",
				failureReason: "telegramChatId is missing in recipient metadata",
			};
		}

		const telegramToken = env.TELEGRAM_BOT_TOKEN;
		if (!telegramToken) {
			if (isLocalRuntime()) {
				return {
					status: "sent",
					providerMessageId: `mock-telegram-${params.intentId}`,
					providerRecipient: chatId,
				};
			}

			return {
				status: "failed",
				failureReason: "TELEGRAM_BOT_TOKEN is not configured",
				providerRecipient: chatId,
			};
		}

		const telegramApiBaseUrl =
			env.TELEGRAM_BOT_API_BASE_URL || TELEGRAM_API_BASE_URL_DEFAULT;
		const text = [params.recipient.title, params.recipient.body]
			.filter(Boolean)
			.join("\n")
			.slice(0, 4000);

		try {
			const response = await fetch(
				`${telegramApiBaseUrl}/bot${telegramToken}/sendMessage`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						chat_id: chatId,
						text,
					}),
				}
			);
			const responseText = await response.text();
			if (!response.ok) {
				return {
					status: "failed",
					failureReason: `Telegram API returned HTTP ${response.status}`,
					responsePayload: responseText.slice(0, 4000),
					providerRecipient: chatId,
				};
			}

			let providerMessageId = `telegram-${params.intentId}`;
			try {
				const parsed = JSON.parse(responseText) as {
					ok?: boolean;
					description?: string;
					result?: {
						message_id?: number | string;
					};
				};
				if (!parsed.ok) {
					return {
						status: "failed",
						failureReason:
							parsed.description || "Telegram API rejected notification",
						responsePayload: responseText.slice(0, 4000),
						providerRecipient: chatId,
					};
				}
				providerMessageId = String(
					parsed.result?.message_id ?? providerMessageId
				);
			} catch {
				// ignore parsing errors and keep fallback providerMessageId
			}

			return {
				status: "sent",
				providerMessageId,
				responsePayload: responseText.slice(0, 4000),
				providerRecipient: chatId,
			};
		} catch (error) {
			return {
				status: "failed",
				failureReason:
					error instanceof Error ? error.message : "Telegram send failed",
				providerRecipient: chatId,
			};
		}
	}
}

export class LegacySocialProvider extends TelegramProvider {
	channel: NotificationChannel = "social";
	name = "telegram_legacy_social";
}

export class MockVkProvider implements NotificationProvider {
	channel: NotificationChannel = "vk";
	name = "mock_vk";

	send(params: {
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult> {
		const recipientId = String(
			params.recipient.metadata?.vkPeerId ?? ""
		).trim();
		if (!recipientId) {
			return Promise.resolve({
				status: "failed",
				failureReason: "vkPeerId is missing in recipient metadata",
			});
		}

		return Promise.resolve({
			status: "sent",
			providerMessageId: `mock-vk-${params.intentId}`,
			providerRecipient: recipientId,
		});
	}
}

export class MockMaxProvider implements NotificationProvider {
	channel: NotificationChannel = "max";
	name = "mock_max";

	send(params: {
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult> {
		const recipientId = String(
			params.recipient.metadata?.maxUserId ?? ""
		).trim();
		if (!recipientId) {
			return Promise.resolve({
				status: "failed",
				failureReason: "maxUserId is missing in recipient metadata",
			});
		}

		return Promise.resolve({
			status: "sent",
			providerMessageId: `mock-max-${params.intentId}`,
			providerRecipient: recipientId,
		});
	}
}

export class MockSmsProvider implements NotificationProvider {
	channel: NotificationChannel = "sms";
	name = "mock_sms";

	send(params: {
		intentId: string;
		recipient: NotificationRecipient;
	}): Promise<NotificationProviderResult> {
		const phone = String(params.recipient.metadata?.phone ?? "").trim();
		if (!phone) {
			return Promise.resolve({
				status: "failed",
				failureReason: "phone is missing in recipient metadata",
			});
		}

		return Promise.resolve({
			status: "sent",
			providerMessageId: `mock-sms-${params.intentId}`,
			providerRecipient: phone,
		});
	}
}

type NotificationEventRow = typeof notificationEvent.$inferSelect;

export class NotificationProcessorService {
	private readonly preferenceController: PreferenceController;

	private readonly providersByChannel: Map<
		NotificationChannel,
		NotificationProvider
	>;

	constructor(params?: {
		preferenceController?: PreferenceController;
		providers?: NotificationProvider[];
	}) {
		this.preferenceController =
			params?.preferenceController ?? new PreferenceController();
		const providers = params?.providers ?? [
			new InAppNotificationProvider(),
			new TelegramProvider(),
			new LegacySocialProvider(),
			new MockVkProvider(),
			new MockMaxProvider(),
			new EmailNotificationProvider({
				emailProviderId: DEFAULT_NOTIFICATION_EMAIL_PROVIDER_ID,
			}),
			new MockSmsProvider(),
		];
		this.providersByChannel = new Map(
			providers.map((provider) => [provider.channel, provider])
		);
	}

	private async markEventStatus(params: {
		eventId: string;
		status: "processing" | "processed" | "failed";
		failureReason?: string | null;
	}) {
		await db
			.update(notificationEvent)
			.set({
				status: params.status,
				processingStartedAt:
					params.status === "processing" ? new Date() : undefined,
				processedAt:
					params.status === "processed" || params.status === "failed"
						? new Date()
						: undefined,
				failureReason: params.failureReason,
				updatedAt: new Date(),
			})
			.where(eq(notificationEvent.id, params.eventId));
	}

	private parsePayload(event: NotificationEventRow) {
		return notificationEventPayloadSchema.safeParse(event.payload);
	}

	private async createIntent(params: {
		event: NotificationEventRow;
		recipient: NotificationRecipient;
		channel: NotificationChannel;
	}) {
		const intentId = crypto.randomUUID();
		await db.insert(notificationIntent).values({
			id: intentId,
			eventId: params.event.id,
			organizationId: params.event.organizationId,
			recipientUserId: params.recipient.userId,
			channel: params.channel,
			templateKey: params.event.eventType,
			title: buildIntentDisplayTitle(params.event.eventType, params.recipient),
			body: buildIntentDisplayBody(params.recipient),
			metadata: params.recipient.metadata ?? null,
			status: "pending",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		return intentId;
	}

	private async markIntentStatus(params: {
		intentId: string;
		status: "filtered_out" | "sent" | "failed";
	}) {
		await db
			.update(notificationIntent)
			.set({
				status: params.status,
				processedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(notificationIntent.id, params.intentId));
	}

	private async insertDelivery(params: {
		event: NotificationEventRow;
		intentId: string;
		provider: string;
		result: NotificationProviderResult;
	}) {
		await db.insert(notificationDelivery).values({
			id: crypto.randomUUID(),
			intentId: params.intentId,
			organizationId: params.event.organizationId,
			provider: params.provider,
			providerRecipient: params.result.providerRecipient,
			attempt: 1,
			status: params.result.status,
			providerMessageId: params.result.providerMessageId,
			failureReason: params.result.failureReason,
			responsePayload: params.result.responsePayload,
			sentAt: params.result.status === "sent" ? new Date() : null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	}

	private resolveChannelEnabled(params: {
		event: NotificationEventRow;
		recipient: NotificationRecipient;
		channel: NotificationChannel;
	}) {
		return this.preferenceController.resolveChannelEnabled({
			userId: params.recipient.userId,
			organizationId: params.event.organizationId,
			eventType: params.event.eventType,
			channel: params.channel,
		});
	}

	private async processRecipientChannel(params: {
		event: NotificationEventRow;
		recipient: NotificationRecipient;
		channel: NotificationChannel;
	}) {
		const intentId = await this.createIntent(params);
		const enabled = await this.resolveChannelEnabled(params);
		if (!enabled) {
			await this.markIntentStatus({
				intentId,
				status: "filtered_out",
			});
			return false;
		}

		const provider = this.providersByChannel.get(params.channel);
		if (!provider) {
			await this.insertDelivery({
				event: params.event,
				intentId,
				provider: "missing_provider",
				result: {
					status: "failed",
					failureReason: `No provider configured for channel: ${params.channel}`,
				},
			});
			await this.markIntentStatus({
				intentId,
				status: "failed",
			});
			return true;
		}

		const providerResult = await provider.send({
			event: params.event,
			intentId,
			recipient: params.recipient,
		});
		await this.insertDelivery({
			event: params.event,
			intentId,
			provider: provider.name,
			result: providerResult,
		});
		await this.markIntentStatus({
			intentId,
			status: providerResult.status === "sent" ? "sent" : "failed",
		});

		return providerResult.status === "failed";
	}

	private async processRecipients(params: {
		event: NotificationEventRow;
		recipients: NotificationRecipient[];
	}) {
		let hasFailures = false;
		for (const recipient of params.recipients) {
			for (const channel of recipient.channels) {
				const channelFailed = await this.processRecipientChannel({
					event: params.event,
					recipient,
					channel,
				});
				hasFailures = hasFailures || channelFailed;
			}
		}
		return hasFailures;
	}

	async processEventById(eventId: string) {
		const [event] = await db
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.id, eventId))
			.limit(1);

		if (!event) {
			return { status: "not_found" as const };
		}

		if (event.status === "processed") {
			return { status: "already_processed" as const };
		}

		await this.markEventStatus({
			eventId: event.id,
			status: "processing",
			failureReason: null,
		});

		const parsedPayload = this.parsePayload(event);
		if (!parsedPayload.success) {
			await this.markEventStatus({
				eventId: event.id,
				status: "failed",
				failureReason: "Invalid notification payload schema",
			});
			return {
				status: "failed" as const,
				reason: "invalid_payload" as const,
			};
		}

		try {
			const hasFailures = await this.processRecipients({
				event,
				recipients: parsedPayload.data.recipients,
			});
			await this.markEventStatus({
				eventId: event.id,
				status: hasFailures ? "failed" : "processed",
				failureReason: hasFailures
					? "One or more channel deliveries failed"
					: null,
			});
			return {
				status: hasFailures ? ("failed" as const) : ("processed" as const),
			};
		} catch (error) {
			await this.markEventStatus({
				eventId: event.id,
				status: "failed",
				failureReason: toFailureReason(error),
			});
			return {
				status: "failed" as const,
				reason: "exception" as const,
			};
		}
	}
}
