import { auth } from "@my-app/auth";
import { db } from "@my-app/db";
import { member } from "@my-app/db/schema/auth";
import { EventBus } from "@my-app/events";
import { NOTIFICATION_QUEUE, RECURRING_TASK_QUEUE } from "@my-app/queue";
import type { QueueProducer } from "@my-app/queue/producer";
import { createPgBossProducer } from "@my-app/queue/producer";
import type { WorkflowContext } from "@my-app/workflows";

export type { QueueProducer as NotificationQueueProducer } from "@my-app/queue/producer";

import { and, asc, eq } from "drizzle-orm";
import type { Context as HonoContext } from "hono";

export interface CreateContextOptions {
	context: HonoContext;
}

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export interface ActiveOrganizationMembership {
	organizationId: string;
	role: string;
}

export interface Context {
	activeMembership: ActiveOrganizationMembership | null;
	eventBus?: EventBus;
	notificationQueue?: QueueProducer;
	recurringTaskQueue?: QueueProducer;
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
	notificationQueue?: QueueProducer;
	recurringTaskQueue?: QueueProducer;
}

const parseCookiesFromHeader = (
	cookieHeader: string | null,
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
	session: AuthSession,
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
					eq(member.userId, userId),
				),
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

const notificationQueue = createPgBossProducer(NOTIFICATION_QUEUE);
const recurringTaskQueue = createPgBossProducer(RECURRING_TASK_QUEUE);

interface BuildWorkflowContextOptions {
	actorUserId?: string;
	eventBus?: EventBus;
	idempotencyKey: string;
	organizationId: string;
}

const buildWorkflowContextFromOptions = (
	options: BuildWorkflowContextOptions,
): WorkflowContext => ({
	organizationId: options.organizationId,
	actorUserId: options.actorUserId,
	idempotencyKey: options.idempotencyKey,
	eventBus: options.eventBus ?? new EventBus(),
});

export function buildWorkflowContext(
	context: OrganizationContext,
	idempotencyKey: string,
): WorkflowContext;
export function buildWorkflowContext(
	options: BuildWorkflowContextOptions,
): WorkflowContext;
export function buildWorkflowContext(
	contextOrOptions: OrganizationContext | BuildWorkflowContextOptions,
	idempotencyKey?: string,
): WorkflowContext {
	if (typeof idempotencyKey === "string") {
		const context = contextOrOptions as OrganizationContext;

		return buildWorkflowContextFromOptions({
			actorUserId: context.session?.user?.id ?? undefined,
			eventBus: context.eventBus,
			idempotencyKey,
			organizationId: context.activeMembership.organizationId,
		});
	}

	return buildWorkflowContextFromOptions(
		contextOrOptions as BuildWorkflowContextOptions,
	);
}

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
		context.req.raw.headers.get("cookie"),
	);
	const eventBus = new EventBus();

	return {
		session,
		activeMembership,
		requestUrl,
		requestHostname,
		requestCookies,
		eventBus,
		notificationQueue,
		recurringTaskQueue,
	};
}
