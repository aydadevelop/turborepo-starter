import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { EventBus } from "./lib/event-bus";
import {
	hasOrganizationPermission,
	type OrganizationPermission,
} from "./organization";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next();
});

const requireActiveOrganization = o.middleware(({ context, next }) => {
	if (!context.activeMembership) {
		throw new ORPCError("FORBIDDEN");
	}
	return next({
		context: {
			activeMembership: context.activeMembership,
			eventBus: context.eventBus ?? new EventBus(),
		},
	});
});

const flushEvents = o.middleware(async ({ context, next }) => {
	const result = await next();
	const eventBus = (context as Context & { eventBus?: EventBus }).eventBus;
	if (eventBus && eventBus.size > 0) {
		await eventBus.flush(context.notificationQueue);
	}
	return result;
});

const requireOrganizationPermission = (permission: OrganizationPermission) =>
	o.middleware(({ context, next }) => {
		if (!context.activeMembership) {
			throw new ORPCError("FORBIDDEN");
		}

		const isAllowed = hasOrganizationPermission(
			context.activeMembership.role,
			permission
		);

		if (!isAllowed) {
			throw new ORPCError("FORBIDDEN");
		}
		return next();
	});

export const protectedProcedure = publicProcedure.use(requireAuth);
export const organizationProcedure = protectedProcedure
	.use(requireActiveOrganization)
	.use(flushEvents);

export const organizationPermissionProcedure = (
	permission: OrganizationPermission
) => organizationProcedure.use(requireOrganizationPermission(permission));

export type { OrganizationContext } from "./context";
