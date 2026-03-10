import { appContract } from "@my-app/api-contract/routers";
import { implement, ORPCError } from "@orpc/server";

import type { Context } from "./context";
import { EventBus } from "@my-app/events";
import {
	hasOrganizationPermission,
	type OrganizationPermission,
} from "./organization";

export const o = implement(appContract).$context<Context>();

export const publicProcedure = o;

const getSessionUser = (context: Context) => {
	const user = context.session?.user as
		| {
				id?: string | null;
				isAnonymous?: boolean | null;
				is_anonymous?: boolean | null;
		  }
		| undefined;

	return user;
};

const hasSessionUser = (context: Context): boolean => {
	const user = getSessionUser(context);
	return Boolean(user?.id);
};

const hasNonAnonymousSessionUser = (context: Context): boolean => {
	const user = getSessionUser(context);
	if (!user?.id) {
		return false;
	}

	return !(user.isAnonymous ?? user.is_anonymous ?? false);
};

const requireSession = o.middleware(({ context, next }) => {
	if (!hasSessionUser(context)) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next();
});

const requireAuthenticatedUser = o.middleware(({ context, next }) => {
	if (!hasNonAnonymousSessionUser(context)) {
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
			eventBus: new EventBus(context.notificationQueue),
		},
	});
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

export const sessionProcedure = publicProcedure.use(requireSession);
export const protectedProcedure = sessionProcedure.use(
	requireAuthenticatedUser
);
export const organizationProcedure = protectedProcedure.use(requireActiveOrganization);

export const organizationPermissionProcedure = (
	permission: OrganizationPermission
) => organizationProcedure.use(requireOrganizationPermission(permission));

export type { OrganizationContext } from "./context";
