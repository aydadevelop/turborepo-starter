import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
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
	return next();
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
export const organizationProcedure = protectedProcedure.use(
	requireActiveOrganization
);

export const organizationPermissionProcedure = (
	permission: OrganizationPermission
) => organizationProcedure.use(requireOrganizationPermission(permission));
