import { recurringTaskTickMessageSchema } from "@my-app/api-contract/contracts/recurring-task-queue";
import { auth } from "@my-app/auth";
import { db } from "@my-app/db";
import { member } from "@my-app/db/schema/auth";
import { notificationQueueMessageSchema } from "@my-app/notifications/contracts";
import { and, asc, eq } from "drizzle-orm";
import type { Context as HonoContext } from "hono";

import type { EventBus } from "./lib/event-bus";
import { processRecurringTaskTick } from "./tasks/recurring";

export interface CreateContextOptions {
	context: HonoContext;
}

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export interface ActiveOrganizationMembership {
	organizationId: string;
	role: string;
}

export interface NotificationQueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

interface NotificationInlineProcessorResult {
	reason?: string;
	status: "processed" | "already_processed" | "failed" | "not_found";
}

interface NotificationInlineProcessor {
	processEventById(eventId: string): Promise<NotificationInlineProcessorResult>;
}

const isNotificationQueueProducer = (
	value: unknown
): value is NotificationQueueProducer => {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	return typeof (value as { send?: unknown }).send === "function";
};

const LOCAL_REQUEST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

let inlineNotificationProcessorPromise:
	| Promise<NotificationInlineProcessor | null>
	| undefined;

const getInlineNotificationProcessor = () => {
	if (!inlineNotificationProcessorPromise) {
		inlineNotificationProcessorPromise = (async () => {
			try {
				const notificationsProcessorModule = (await import(
					"@my-app/notifications/processor"
				)) as {
					NotificationProcessorService?: new () => NotificationInlineProcessor;
				};
				const ProcessorCtor =
					notificationsProcessorModule.NotificationProcessorService;
				if (!ProcessorCtor) {
					return null;
				}

				return new ProcessorCtor();
			} catch (error) {
				console.error("Inline notification processor is unavailable", error);
				return null;
			}
		})();
	}

	return inlineNotificationProcessorPromise;
};

const inlineNotificationQueueProducer: NotificationQueueProducer = {
	send: async (message) => {
		const parsedMessage = notificationQueueMessageSchema.safeParse(message);
		if (!parsedMessage.success) {
			throw new Error("Inline notification queue: unsupported message kind");
		}

		const processor = await getInlineNotificationProcessor();
		if (!processor) {
			throw new Error("Inline notification processor is unavailable");
		}

		const result = await processor.processEventById(parsedMessage.data.eventId);
		if (
			result.status === "processed" ||
			result.status === "already_processed"
		) {
			return;
		}

		if (result.status === "not_found") {
			throw new Error(
				`Inline notification event not found: ${parsedMessage.data.eventId}`
			);
		}

		const reason =
			typeof result.reason === "string" && result.reason.trim().length > 0
				? ` (${result.reason.trim()})`
				: "";
		throw new Error(
			`Inline notification processing failed: ${result.status}${reason}`
		);
	},
};

const inlineRecurringTaskQueueProducer: NotificationQueueProducer = {
	send: (message, options) => {
		const recurringMessage = recurringTaskTickMessageSchema.safeParse(message);
		if (!recurringMessage.success) {
			return Promise.reject(
				new Error("Inline recurring task queue: unsupported message kind")
			);
		}

		const delayMs = (options?.delaySeconds ?? 0) * 1000;
		setTimeout(async () => {
			try {
				await processRecurringTaskTick({
					message: recurringMessage.data,
					notificationQueue: inlineNotificationQueueProducer,
					recurringTaskQueue: inlineRecurringTaskQueueProducer,
				});
			} catch (error) {
				console.error("Inline recurring task processing failed", error);
			}
		}, delayMs);
		return Promise.resolve();
	},
};

export interface Context {
	activeMembership: ActiveOrganizationMembership | null;
	eventBus?: EventBus;
	notificationQueue?: NotificationQueueProducer;
	recurringTaskQueue?: NotificationQueueProducer;
	requestCookies?: Readonly<Record<string, string>>;
	requestHostname: string;
	requestUrl: string;
	session: AuthSession;
}

/**
 * Narrowed context available in organizationProcedure+ handlers.
 * activeMembership is guaranteed non-null.
 */
export interface OrganizationContext extends Context {
	activeMembership: ActiveOrganizationMembership;
	eventBus: EventBus;
	notificationQueue?: NotificationQueueProducer;
	recurringTaskQueue?: NotificationQueueProducer;
}

const parseCookiesFromHeader = (
	cookieHeader: string | null
): Readonly<Record<string, string>> => {
	if (!cookieHeader) {
		return {};
	}

	const parsed: Record<string, string> = {};
	for (const pair of cookieHeader.split(";")) {
		const separatorIndex = pair.indexOf("=");
		if (separatorIndex <= 0) {
			continue;
		}

		const key = pair.slice(0, separatorIndex).trim();
		if (!key) {
			continue;
		}
		const rawValue = pair.slice(separatorIndex + 1).trim();
		try {
			parsed[key] = decodeURIComponent(rawValue);
		} catch {
			parsed[key] = rawValue;
		}
	}

	return parsed;
};

const getActiveOrganizationMembership = async (
	session: AuthSession
): Promise<ActiveOrganizationMembership | null> => {
	const userId = session?.user?.id;
	const activeOrganizationId = getActiveOrganizationId(session);

	if (!userId) {
		return null;
	}

	if (activeOrganizationId) {
		const [activeMembership] = await db
			.select({
				organizationId: member.organizationId,
				role: member.role,
			})
			.from(member)
			.where(
				and(
					eq(member.organizationId, activeOrganizationId),
					eq(member.userId, userId)
				)
			)
			.limit(1);

		if (activeMembership) {
			return activeMembership;
		}

		return null;
	}

	const memberships = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.userId, userId))
		.orderBy(asc(member.createdAt))
		.limit(2);

	if (memberships.length === 1) {
		return memberships[0] ?? null;
	}

	return null;
};

const getActiveOrganizationId = (session: AuthSession) => {
	if (!session) {
		return null;
	}

	const authSession = session.session as typeof session.session & {
		activeOrganizationId?: string | null;
	};

	return authSession.activeOrganizationId ?? null;
};

export async function createContext({
	context,
}: CreateContextOptions): Promise<Context> {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	const requestUrl = context.req.raw.url;
	let requestHostname = "";
	try {
		requestHostname = new URL(requestUrl).hostname.toLowerCase();
	} catch {
		requestHostname = "";
	}

	const activeMembership = await getActiveOrganizationMembership(session);
	const requestCookies = parseCookiesFromHeader(
		context.req.raw.headers.get("cookie")
	);
	const envQueues = (
		context as HonoContext & {
			env?: {
				NOTIFICATION_QUEUE?: unknown;
				RECURRING_TASK_QUEUE?: unknown;
			};
		}
	).env;
	const notificationQueueCandidate = envQueues?.NOTIFICATION_QUEUE;
	const recurringTaskQueueCandidate = envQueues?.RECURRING_TASK_QUEUE;
	const notificationQueue = isNotificationQueueProducer(
		notificationQueueCandidate
	)
		? notificationQueueCandidate
		: undefined;
	const recurringTaskQueue = isNotificationQueueProducer(
		recurringTaskQueueCandidate
	)
		? recurringTaskQueueCandidate
		: undefined;
	const resolvedNotificationQueue =
		notificationQueue ??
		(LOCAL_REQUEST_HOSTNAMES.has(requestHostname)
			? inlineNotificationQueueProducer
			: undefined);
	const resolvedRecurringTaskQueue =
		recurringTaskQueue ??
		(LOCAL_REQUEST_HOSTNAMES.has(requestHostname)
			? inlineRecurringTaskQueueProducer
			: undefined);

	return {
		session,
		activeMembership,
		requestUrl,
		requestHostname,
		requestCookies,
		notificationQueue: resolvedNotificationQueue,
		recurringTaskQueue: resolvedRecurringTaskQueue,
	};
}
