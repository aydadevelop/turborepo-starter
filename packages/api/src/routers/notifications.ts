import { db } from "@full-stack-cf-app/db";
import {
	notificationEvent,
	notificationEventStatusValues,
	notificationInApp,
	notificationSeverityValues,
} from "@full-stack-cf-app/db/schema/notification";
import { subscribeNotificationEventPublished } from "@full-stack-cf-app/notifications/pusher";
import { eventIterator, ORPCError, withEventMeta } from "@orpc/server";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import z from "zod";

import { organizationPermissionProcedure, protectedProcedure } from "../index";

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
	payload: z.string(),
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

const listInAppRows = (params: {
	userId: string;
	limit: number;
	sinceMs?: number;
}) => {
	if (params.sinceMs && params.sinceMs > 0) {
		return db
			.select()
			.from(notificationInApp)
			.where(
				and(
					eq(notificationInApp.userId, params.userId),
					gt(notificationInApp.deliveredAt, new Date(params.sinceMs))
				)
			)
			.orderBy(desc(notificationInApp.deliveredAt))
			.limit(params.limit);
	}

	return db
		.select()
		.from(notificationInApp)
		.where(eq(notificationInApp.userId, params.userId))
		.orderBy(desc(notificationInApp.deliveredAt))
		.limit(params.limit);
};

const listEventRows = (params: {
	organizationId: string;
	limit: number;
	sinceMs?: number;
}) => {
	if (params.sinceMs && params.sinceMs > 0) {
		return db
			.select()
			.from(notificationEvent)
			.where(
				and(
					eq(notificationEvent.organizationId, params.organizationId),
					gt(notificationEvent.createdAt, new Date(params.sinceMs))
				)
			)
			.orderBy(desc(notificationEvent.createdAt))
			.limit(params.limit);
	}

	return db
		.select()
		.from(notificationEvent)
		.where(eq(notificationEvent.organizationId, params.organizationId))
		.orderBy(desc(notificationEvent.createdAt))
		.limit(params.limit);
};

const countUnreadInAppByUserId = async (userId: string) => {
	const rows = await db
		.select({
			unread: sql<number>`count(*)`,
		})
		.from(notificationInApp)
		.where(
			and(
				eq(notificationInApp.userId, userId),
				isNull(notificationInApp.viewedAt)
			)
		);

	return Number(rows[0]?.unread ?? 0);
};

const latestDeliveredAtMs = (
	rows: (typeof notificationInApp.$inferSelect)[]
) => {
	if (rows.length === 0) {
		return 0;
	}

	return Math.max(...rows.map((row) => row.deliveredAt.getTime()));
};

const latestCreatedAtMs = (rows: (typeof notificationEvent.$inferSelect)[]) => {
	if (rows.length === 0) {
		return 0;
	}

	return Math.max(...rows.map((row) => row.createdAt.getTime()));
};

const toInAppNotificationItem = (
	row: typeof notificationInApp.$inferSelect
): z.infer<typeof inAppNotificationItemSchema> => {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		ctaUrl: row.ctaUrl,
		severity: row.severity,
		deliveredAt: row.deliveredAt.toISOString(),
		viewedAt: row.viewedAt ? row.viewedAt.toISOString() : null,
	};
};

const toNotificationEventItem = (
	row: typeof notificationEvent.$inferSelect
): z.infer<typeof notificationEventItemSchema> => {
	return {
		id: row.id,
		organizationId: row.organizationId,
		actorUserId: row.actorUserId,
		eventType: row.eventType,
		sourceType: row.sourceType,
		sourceId: row.sourceId,
		idempotencyKey: row.idempotencyKey,
		payload: row.payload,
		status: row.status,
		processingStartedAt: row.processingStartedAt
			? row.processingStartedAt.toISOString()
			: null,
		processedAt: row.processedAt ? row.processedAt.toISOString() : null,
		failureReason: row.failureReason,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
};

const parseCursorMs = (value: string | number | undefined) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 0;
	}

	return Math.floor(parsed);
};

const withJitter = (delayMs: number, jitterRatio: number) => {
	if (jitterRatio <= 0) {
		return delayMs;
	}

	const spread = Math.max(1, Math.floor(delayMs * jitterRatio));
	const offset = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
	return Math.max(250, delayMs + offset);
};

const createHintWaiter = (signal?: AbortSignal) => {
	let hasPendingHint = false;
	let releaseWait: (() => void) | undefined;

	const notify = () => {
		if (releaseWait) {
			const release = releaseWait;
			releaseWait = undefined;
			release();
			return;
		}

		hasPendingHint = true;
	};

	const wait = (ms: number) => {
		return new Promise<void>((resolve) => {
			if (signal?.aborted) {
				resolve();
				return;
			}

			if (hasPendingHint) {
				hasPendingHint = false;
				resolve();
				return;
			}

			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			const cleanup = () => {
				if (timeoutId) {
					clearTimeout(timeoutId);
				}
				if (signal) {
					signal.removeEventListener("abort", onAbort);
				}
				if (releaseWait === release) {
					releaseWait = undefined;
				}
			};
			const release = () => {
				cleanup();
				resolve();
			};
			const onAbort = () => {
				cleanup();
				resolve();
			};

			timeoutId = setTimeout(() => {
				release();
			}, ms);
			releaseWait = release;
			signal?.addEventListener("abort", onAbort);
		});
	};

	return {
		notify,
		wait,
	};
};

const ME_POLL_DELAY_MS = 5000;
const ALL_POLL_DELAY_MS = 30_000;
const HEARTBEAT_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;
const JITTER_RATIO = 0.2;

export const notificationsRouter = {
	listMe: protectedProcedure
		.route({
			tags: ["Notifications"],
			summary: "List current user notifications",
			description:
				"Returns latest in-app notifications for the current user and unread count.",
		})
		.input(listInAppInputSchema)
		.output(listInAppOutputSchema)
		.handler(async ({ context, input }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const [items, unread] = await Promise.all([
				listInAppRows({
					userId,
					limit: input.limit,
				}),
				countUnreadInAppByUserId(userId),
			]);

			return {
				items: items.map(toInAppNotificationItem),
				unread,
			};
		}),

	markViewed: protectedProcedure
		.route({
			tags: ["Notifications"],
			summary: "Mark notifications as viewed",
			description:
				"Marks selected in-app notifications as viewed for the current user.",
		})
		.input(markViewedInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			await db
				.update(notificationInApp)
				.set({
					viewedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(notificationInApp.userId, userId),
						inArray(notificationInApp.id, input.notificationIds)
					)
				);

			return {
				ok: true,
			};
		}),

	markAllViewed: protectedProcedure
		.route({
			tags: ["Notifications"],
			summary: "Mark all notifications as viewed",
			description:
				"Marks all unread in-app notifications as viewed for the current user.",
		})
		.input(z.object({}))
		.output(successOutputSchema)
		.handler(async ({ context }) => {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			await db
				.update(notificationInApp)
				.set({
					viewedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(notificationInApp.userId, userId),
						isNull(notificationInApp.viewedAt)
					)
				);

			return {
				ok: true,
			};
		}),

	streamMe: protectedProcedure
		.route({
			tags: ["Notifications"],
			summary: "Stream in-app notifications for current user",
			description:
				"Streams user notifications as an event iterator and resumes from lastEventId.",
		})
		.input(streamInputSchema)
		.output(eventIterator(streamEventSchema))
		.handler(async function* ({ context, input, lastEventId, signal }) {
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED");
			}

			const hintWaiter = createHintWaiter(signal);
			const unsubscribe = subscribeNotificationEventPublished((hint) => {
				if (hint.recipientUserIds.includes(userId)) {
					hintWaiter.notify();
				}
			});

			let cursorMs = Math.max(
				parseCursorMs(lastEventId),
				parseCursorMs(input.since)
			);
			let failureCount = 0;
			let nextHeartbeatAt = Date.now() + HEARTBEAT_MS;

			try {
				yield withEventMeta(
					{
						kind: "ready" as const,
						scope: "me" as const,
						since: cursorMs,
					},
					{
						id: cursorMs > 0 ? String(cursorMs) : undefined,
						retry: ME_POLL_DELAY_MS,
					}
				);

				while (!signal?.aborted) {
					let nextDelayMs = ME_POLL_DELAY_MS;
					try {
						const rows = await listInAppRows({
							userId,
							limit: input.limit,
							sinceMs: cursorMs > 0 ? cursorMs : undefined,
						});
						if (rows.length > 0) {
							const latestMs = Math.max(cursorMs, latestDeliveredAtMs(rows));
							cursorMs = latestMs;
							yield withEventMeta(
								{
									kind: "snapshot" as const,
									scope: "me" as const,
									items: rows.map(toInAppNotificationItem),
									since: cursorMs,
								},
								{
									id: String(cursorMs),
								}
							);
						}

						failureCount = 0;
					} catch (error) {
						console.error("Failed to poll notification RPC stream(me)", error);
						failureCount += 1;
						const backoffBase =
							ME_POLL_DELAY_MS * 2 ** Math.min(failureCount, 8);
						nextDelayMs = Math.min(MAX_BACKOFF_MS, backoffBase);
					}

					const now = Date.now();
					if (now >= nextHeartbeatAt) {
						yield {
							kind: "ping" as const,
							scope: "me" as const,
							ts: now,
							since: cursorMs,
						};
						nextHeartbeatAt = now + HEARTBEAT_MS;
					}

					await hintWaiter.wait(withJitter(nextDelayMs, JITTER_RATIO));
				}
			} finally {
				unsubscribe();
			}
		}),

	streamAll: organizationPermissionProcedure({
		notification: ["read"],
	})
		.route({
			tags: ["Notifications"],
			summary: "Stream organization notification events",
			description:
				"Streams organization-level notification events and resumes from lastEventId.",
		})
		.input(streamInputSchema)
		.output(eventIterator(streamEventSchema))
		.handler(async function* ({ context, input, lastEventId, signal }) {
			const organizationId = context.activeMembership?.organizationId;
			if (!organizationId) {
				throw new ORPCError("FORBIDDEN");
			}

			const hintWaiter = createHintWaiter(signal);
			const unsubscribe = subscribeNotificationEventPublished((hint) => {
				if (hint.organizationId === organizationId) {
					hintWaiter.notify();
				}
			});

			let cursorMs = Math.max(
				parseCursorMs(lastEventId),
				parseCursorMs(input.since)
			);
			let failureCount = 0;
			let nextHeartbeatAt = Date.now() + HEARTBEAT_MS;

			try {
				yield withEventMeta(
					{
						kind: "ready" as const,
						scope: "all" as const,
						organizationId,
						since: cursorMs,
					},
					{
						id: cursorMs > 0 ? String(cursorMs) : undefined,
						retry: ALL_POLL_DELAY_MS,
					}
				);

				while (!signal?.aborted) {
					let nextDelayMs = ALL_POLL_DELAY_MS;
					try {
						const items = await listEventRows({
							organizationId,
							limit: input.limit,
							sinceMs: cursorMs > 0 ? cursorMs : undefined,
						});
						if (items.length > 0) {
							const latestMs = Math.max(cursorMs, latestCreatedAtMs(items));
							cursorMs = latestMs;
							yield withEventMeta(
								{
									kind: "snapshot" as const,
									scope: "all" as const,
									organizationId,
									items: items.map(toNotificationEventItem),
									since: cursorMs,
								},
								{
									id: String(cursorMs),
								}
							);
						}

						failureCount = 0;
					} catch (error) {
						console.error("Failed to poll notification RPC stream(all)", error);
						failureCount += 1;
						const backoffBase =
							ALL_POLL_DELAY_MS * 2 ** Math.min(failureCount, 8);
						nextDelayMs = Math.min(MAX_BACKOFF_MS, backoffBase);
					}

					const now = Date.now();
					if (now >= nextHeartbeatAt) {
						yield {
							kind: "ping" as const,
							scope: "all" as const,
							organizationId,
							ts: now,
							since: cursorMs,
						};
						nextHeartbeatAt = now + HEARTBEAT_MS;
					}

					await hintWaiter.wait(withJitter(nextDelayMs, JITTER_RATIO));
				}
			} finally {
				unsubscribe();
			}
		}),
};
