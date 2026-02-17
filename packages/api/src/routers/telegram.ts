import { db } from "@full-stack-cf-app/db";
import {
	inboundMessage,
	supportTicket,
	telegramNotification,
	telegramWebhookEvent,
} from "@full-stack-cf-app/db/schema/support";
import { createTelegramNotificationDispatchMessage } from "@full-stack-cf-app/notifications/contracts";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";
import {
	listManagedTelegramNotificationsInputSchema,
	listManagedTelegramWebhookEventsInputSchema,
	processManagedTelegramNotificationInputSchema,
	queueManagedTelegramNotificationInputSchema,
	registerManagedTelegramWebhookEventInputSchema,
	telegramNotificationOutputSchema,
	telegramWebhookEventOutputSchema,
} from "../contracts/telegram";
import { organizationPermissionProcedure } from "../index";
import {
	requireActiveMembership,
	requireSessionUserId,
} from "./shared/auth-utils";

const requireManagedTelegramNotification = async (params: {
	notificationId: string;
	organizationId: string;
}) => {
	const [managedNotification] = await db
		.select()
		.from(telegramNotification)
		.where(
			and(
				eq(telegramNotification.id, params.notificationId),
				eq(telegramNotification.organizationId, params.organizationId)
			)
		)
		.limit(1);

	if (!managedNotification) {
		throw new ORPCError("NOT_FOUND");
	}

	return managedNotification;
};

export const telegramRouter = {
	notificationQueueManaged: organizationPermissionProcedure({
		notification: ["create"],
	})
		.route({
			tags: ["Telegram"],
			summary: "Queue Telegram notification",
			description:
				"Queue a Telegram notification for delivery. Returns idempotent result if the same idempotency key is reused.",
		})
		.input(queueManagedTelegramNotificationInputSchema)
		.output(
			z.object({
				idempotent: z.boolean(),
				notification: telegramNotificationOutputSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const sessionUserId = requireSessionUserId(context);

			if (input.ticketId) {
				const [managedTicket] = await db
					.select({ id: supportTicket.id })
					.from(supportTicket)
					.where(
						and(
							eq(supportTicket.id, input.ticketId),
							eq(supportTicket.organizationId, activeMembership.organizationId)
						)
					)
					.limit(1);

				if (!managedTicket) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Ticket is not available in the active organization",
					});
				}
			}

			const [existingNotification] = await db
				.select()
				.from(telegramNotification)
				.where(
					and(
						eq(
							telegramNotification.organizationId,
							activeMembership.organizationId
						),
						eq(telegramNotification.idempotencyKey, input.idempotencyKey)
					)
				)
				.limit(1);

			if (existingNotification) {
				return {
					idempotent: true,
					notification: existingNotification,
				};
			}

			const notificationId = crypto.randomUUID();
			await db.insert(telegramNotification).values({
				id: notificationId,
				organizationId: activeMembership.organizationId,
				ticketId: input.ticketId,
				requestedByUserId: sessionUserId,
				templateKey: input.templateKey,
				recipientChatId: input.recipientChatId,
				idempotencyKey: input.idempotencyKey,
				payload: input.payload,
				status: "queued",
				attemptCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdNotification] = await db
				.select()
				.from(telegramNotification)
				.where(eq(telegramNotification.id, notificationId))
				.limit(1);

			if (!createdNotification) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			if (context.notificationQueue) {
				try {
					await context.notificationQueue.send(
						createTelegramNotificationDispatchMessage({
							notificationId,
							organizationId: activeMembership.organizationId,
						}),
						{
							contentType: "json",
						}
					);
				} catch (error) {
					console.error(
						"Failed to publish telegram notification to queue",
						error
					);
				}
			}

			return {
				idempotent: false,
				notification: createdNotification,
			};
		}),

	notificationListManaged: organizationPermissionProcedure({
		notification: ["read"],
	})
		.route({
			tags: ["Telegram"],
			summary: "List Telegram notifications",
			description:
				"List Telegram notifications with optional filters for status, ticket, and recipient.",
		})
		.input(listManagedTelegramNotificationsInputSchema)
		.output(z.array(telegramNotificationOutputSchema))
		.handler(({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const where = and(
				eq(
					telegramNotification.organizationId,
					activeMembership.organizationId
				),
				input.status
					? eq(telegramNotification.status, input.status)
					: undefined,
				input.ticketId
					? eq(telegramNotification.ticketId, input.ticketId)
					: undefined,
				input.recipientChatId
					? eq(telegramNotification.recipientChatId, input.recipientChatId)
					: undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return db
				.select()
				.from(telegramNotification)
				.where(where)
				.orderBy(desc(telegramNotification.createdAt))
				.limit(input.limit);
		}),

	notificationProcessManaged: organizationPermissionProcedure({
		notification: ["update"],
	})
		.route({
			tags: ["Telegram"],
			summary: "Process Telegram notification",
			description: "Update a Telegram notification delivery status.",
		})
		.input(processManagedTelegramNotificationInputSchema)
		.output(telegramNotificationOutputSchema)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const managedNotification = await requireManagedTelegramNotification({
				notificationId: input.notificationId,
				organizationId: activeMembership.organizationId,
			});

			await db
				.update(telegramNotification)
				.set({
					status: input.status,
					providerMessageId:
						input.providerMessageId ?? managedNotification.providerMessageId,
					failureReason:
						input.status === "failed"
							? input.failureReason
							: managedNotification.failureReason,
					attemptCount:
						input.status === "failed"
							? managedNotification.attemptCount + 1
							: managedNotification.attemptCount,
					sentAt:
						input.status === "sent" ? new Date() : managedNotification.sentAt,
					updatedAt: new Date(),
				})
				.where(eq(telegramNotification.id, managedNotification.id));

			const [updatedNotification] = await db
				.select()
				.from(telegramNotification)
				.where(eq(telegramNotification.id, managedNotification.id))
				.limit(1);

			if (!updatedNotification) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return updatedNotification;
		}),

	webhookEventRegisterManaged: organizationPermissionProcedure({
		intake: ["create"],
	})
		.route({
			tags: ["Telegram"],
			summary: "Register Telegram webhook event",
			description:
				"Register an incoming Telegram webhook event. Deduplicated by updateId.",
		})
		.input(registerManagedTelegramWebhookEventInputSchema)
		.output(
			z.object({
				idempotent: z.boolean(),
				webhookEvent: telegramWebhookEventOutputSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const activeMembership = requireActiveMembership(context);

			if (input.inboundMessageId) {
				const [managedInboundMessage] = await db
					.select({ id: inboundMessage.id })
					.from(inboundMessage)
					.where(
						and(
							eq(inboundMessage.id, input.inboundMessageId),
							eq(inboundMessage.organizationId, activeMembership.organizationId)
						)
					)
					.limit(1);

				if (!managedInboundMessage) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"Inbound message is not available in the active organization",
					});
				}
			}

			const [existingEvent] = await db
				.select()
				.from(telegramWebhookEvent)
				.where(eq(telegramWebhookEvent.updateId, input.updateId))
				.limit(1);

			if (existingEvent) {
				return {
					idempotent: true,
					webhookEvent: existingEvent,
				};
			}

			const webhookEventId = crypto.randomUUID();
			await db.insert(telegramWebhookEvent).values({
				id: webhookEventId,
				organizationId: activeMembership.organizationId,
				inboundMessageId: input.inboundMessageId,
				updateId: input.updateId,
				eventType: input.eventType,
				chatId: input.chatId,
				payload: input.payload,
				status: input.status,
				errorMessage:
					input.status === "failed" ? input.errorMessage : undefined,
				receivedAt: new Date(),
				processedAt:
					input.status === "processed" || input.status === "failed"
						? new Date()
						: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const [createdEvent] = await db
				.select()
				.from(telegramWebhookEvent)
				.where(eq(telegramWebhookEvent.id, webhookEventId))
				.limit(1);

			if (!createdEvent) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return {
				idempotent: false,
				webhookEvent: createdEvent,
			};
		}),

	webhookEventListManaged: organizationPermissionProcedure({
		intake: ["read"],
	})
		.route({
			tags: ["Telegram"],
			summary: "List Telegram webhook events",
			description:
				"List Telegram webhook events with optional filters for status and chat.",
		})
		.input(listManagedTelegramWebhookEventsInputSchema)
		.output(z.array(telegramWebhookEventOutputSchema))
		.handler(({ context, input }) => {
			const activeMembership = requireActiveMembership(context);
			const where = and(
				eq(
					telegramWebhookEvent.organizationId,
					activeMembership.organizationId
				),
				input.status
					? eq(telegramWebhookEvent.status, input.status)
					: undefined,
				input.chatId ? eq(telegramWebhookEvent.chatId, input.chatId) : undefined
			);

			if (!where) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}

			return db
				.select()
				.from(telegramWebhookEvent)
				.where(where)
				.orderBy(desc(telegramWebhookEvent.receivedAt))
				.limit(input.limit);
		}),
};
