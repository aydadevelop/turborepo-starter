import {
	notificationChannelValues,
	notificationSeverityValues,
} from "@my-app/db/schema/notification";
import z from "zod";

export const notificationQueueMessageSchema = z.object({
	kind: z.literal("notification.event.v1"),
	eventId: z.string().trim().min(1),
});

export type NotificationQueueMessage = z.infer<
	typeof notificationQueueMessageSchema
>;

export const notificationRecipientSchema = z.object({
	userId: z.string().trim().min(1),
	channels: z
		.array(z.enum(notificationChannelValues))
		.min(1)
		.default(["in_app"]),
	title: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(4000).optional(),
	ctaUrl: z
		.union([
			z.url(),
			z
				.string()
				.trim()
				.regex(/^\/[^\s]*$/),
		])
		.optional(),
	severity: z.enum(notificationSeverityValues).default("info"),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type NotificationRecipientInput = z.input<
	typeof notificationRecipientSchema
>;
export type NotificationRecipient = z.output<
	typeof notificationRecipientSchema
>;

export const notificationEventPayloadSchema = z.object({
	recipients: z.array(notificationRecipientSchema).min(1),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type NotificationEventPayloadInput = z.input<
	typeof notificationEventPayloadSchema
>;
export type NotificationEventPayload = z.output<
	typeof notificationEventPayloadSchema
>;

export const emitNotificationEventInputSchema = z.object({
	organizationId: z.string().trim().min(1),
	actorUserId: z.string().trim().min(1).optional(),
	eventType: z.string().trim().min(1).max(120),
	sourceType: z.string().trim().min(1).max(80).optional(),
	sourceId: z.string().trim().min(1).max(120).optional(),
	idempotencyKey: z.string().trim().min(3).max(255),
	payload: notificationEventPayloadSchema,
});

export type EmitNotificationEventInput = z.input<
	typeof emitNotificationEventInputSchema
>;

export const createNotificationQueueMessage = (eventId: string) => {
	return notificationQueueMessageSchema.parse({
		kind: "notification.event.v1",
		eventId,
	});
};
