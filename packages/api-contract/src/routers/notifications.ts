import { eventIterator, oc } from "@orpc/contract";
import z from "zod";

const notificationEventStatusValues = [
	"queued",
	"processing",
	"processed",
	"failed",
] as const;

const notificationSeverityValues = [
	"info",
	"success",
	"warning",
	"error",
] as const;

const inAppNotificationItemSchema = z.object({
	id: z.string().trim().min(1),
	title: z.string().trim().min(1),
	body: z.string().nullable(),
	ctaUrl: z.string().nullable(),
	severity: z.enum(notificationSeverityValues),
	deliveredAt: z.string().datetime(),
	viewedAt: z.string().datetime().nullable(),
});

const listInAppInputSchema = z.object({
	limit: z.number().int().min(1).max(200).default(20),
});

const listInAppOutputSchema = z.object({
	items: z.array(inAppNotificationItemSchema),
	unread: z.number().int().min(0),
});

const notificationEventItemSchema = z.object({
	id: z.string().trim().min(1),
	organizationId: z.string().trim().min(1),
	actorUserId: z.string().nullable(),
	eventType: z.string().trim().min(1),
	sourceType: z.string().nullable(),
	sourceId: z.string().nullable(),
	idempotencyKey: z.string().trim().min(1),
	payload: z.record(z.string(), z.unknown()),
	status: z.enum(notificationEventStatusValues),
	processingStartedAt: z.string().datetime().nullable(),
	processedAt: z.string().datetime().nullable(),
	failureReason: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const markViewedInputSchema = z.object({
	notificationIds: z.array(z.string().trim().min(1)).min(1).max(200),
});

const successOutputSchema = z.object({
	ok: z.literal(true),
});

const streamInputSchema = z.object({
	limit: z.number().int().min(1).max(200).default(50),
	since: z.number().int().min(0).optional(),
});

const streamEventSchema = z.union([
	z.object({
		kind: z.literal("ready"),
		scope: z.literal("me"),
		since: z.number().int().min(0),
	}),
	z.object({
		kind: z.literal("snapshot"),
		scope: z.literal("me"),
		since: z.number().int().min(0),
		items: z.array(inAppNotificationItemSchema),
	}),
	z.object({
		kind: z.literal("ping"),
		scope: z.literal("me"),
		ts: z.number().int().min(0),
		since: z.number().int().min(0),
	}),
	z.object({
		kind: z.literal("ready"),
		scope: z.literal("all"),
		organizationId: z.string().trim().min(1),
		since: z.number().int().min(0),
	}),
	z.object({
		kind: z.literal("snapshot"),
		scope: z.literal("all"),
		organizationId: z.string().trim().min(1),
		since: z.number().int().min(0),
		items: z.array(notificationEventItemSchema),
	}),
	z.object({
		kind: z.literal("ping"),
		scope: z.literal("all"),
		organizationId: z.string().trim().min(1),
		ts: z.number().int().min(0),
		since: z.number().int().min(0),
	}),
]);

export const notificationsContract = {
	listMe: oc
		.route({
			tags: ["Notifications"],
			summary: "List current user notifications",
			description:
				"Returns latest in-app notifications for the current user and unread count.",
		})
		.input(listInAppInputSchema)
		.output(listInAppOutputSchema),

	markViewed: oc
		.route({
			tags: ["Notifications"],
			summary: "Mark notifications as viewed",
			description:
				"Marks selected in-app notifications as viewed for the current user.",
		})
		.input(markViewedInputSchema)
		.output(successOutputSchema),

	markAllViewed: oc
		.route({
			tags: ["Notifications"],
			summary: "Mark all notifications as viewed",
			description:
				"Marks all unread in-app notifications as viewed for the current user.",
		})
		.input(z.object({}))
		.output(successOutputSchema),

	streamMe: oc
		.route({
			tags: ["Notifications"],
			summary: "Stream in-app notifications for current user",
			description:
				"Streams user notifications as an event iterator and resumes from lastEventId.",
		})
		.input(streamInputSchema)
		.output(eventIterator(streamEventSchema)),

	streamAll: oc
		.route({
			tags: ["Notifications"],
			summary: "Stream organization notification events",
			description:
				"Streams organization-level notification events and resumes from lastEventId.",
		})
		.input(streamInputSchema)
		.output(eventIterator(streamEventSchema)),
};
