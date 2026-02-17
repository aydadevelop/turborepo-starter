import {
	telegramNotification,
	telegramNotificationStatusValues,
	telegramWebhookEvent,
	telegramWebhookEventStatusValues,
} from "@full-stack-cf-app/db/schema/support";
import { createSelectSchema } from "drizzle-orm/zod";
import z from "zod";
import { optionalTrimmedString } from "./shared";

// ── Output schemas ──

export const telegramNotificationOutputSchema =
	createSelectSchema(telegramNotification);

export const telegramWebhookEventOutputSchema =
	createSelectSchema(telegramWebhookEvent);

// ── Input schemas ──

export const telegramNotificationIdInputSchema = z.object({
	notificationId: z.string().trim().min(1),
});

export const queueManagedTelegramNotificationInputSchema = z.object({
	ticketId: z.string().trim().min(1).optional(),
	templateKey: z.string().trim().min(1).max(100),
	recipientChatId: z.string().trim().min(1).max(255),
	idempotencyKey: z.string().trim().min(3).max(255),
	payload: optionalTrimmedString(20_000),
});

export const listManagedTelegramNotificationsInputSchema = z.object({
	status: z.enum(telegramNotificationStatusValues).optional(),
	ticketId: z.string().trim().min(1).optional(),
	recipientChatId: z.string().trim().min(1).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const processManagedTelegramNotificationInputSchema =
	telegramNotificationIdInputSchema
		.extend({
			status: z.enum(["sent", "failed"] as const),
			providerMessageId: optionalTrimmedString(255),
			failureReason: optionalTrimmedString(2000),
		})
		.refine(
			(value) => value.status !== "failed" || Boolean(value.failureReason),
			{
				message: "failureReason is required when status is failed",
				path: ["failureReason"],
			}
		);

export const registerManagedTelegramWebhookEventInputSchema = z.object({
	inboundMessageId: z.string().trim().min(1).optional(),
	updateId: z.number().int().min(0),
	eventType: z.string().trim().min(1).max(120),
	chatId: optionalTrimmedString(255),
	payload: z.string().trim().min(2).max(200_000),
	status: z.enum(telegramWebhookEventStatusValues).default("received"),
	errorMessage: optionalTrimmedString(2000),
});

export const listManagedTelegramWebhookEventsInputSchema = z.object({
	status: z.enum(telegramWebhookEventStatusValues).optional(),
	chatId: z.string().trim().min(1).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});
