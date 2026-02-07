import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";

import {
	organizationPermissionProcedure,
	protectedProcedure,
	publicProcedure,
} from "../index";
import { boatRouter } from "./boat";
import { todoRouter } from "./todo";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	canManageOrganization: organizationPermissionProcedure({
		organization: ["update"],
	}).handler(({ context }) => {
		if (!context.activeMembership) {
			throw new ORPCError("FORBIDDEN");
		}

		return {
			canManageOrganization: true,
			organizationId: context.activeMembership.organizationId,
			role: context.activeMembership.role,
		};
	}),
	boat: boatRouter,
	todo: todoRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
