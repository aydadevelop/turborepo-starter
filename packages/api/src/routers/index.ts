import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import z from "zod";

import {
	organizationPermissionProcedure,
	protectedProcedure,
	publicProcedure,
} from "../index";
import { boatRouter } from "./boat/router";
import { bookingRouter } from "./booking";
import { helpdeskRouter } from "./helpdesk";
import { intakeRouter } from "./intake";
import { notificationsRouter } from "./notifications";
import { telegramRouter } from "./telegram";
import { todoRouter } from "./todo";

export const appRouter = {
	healthCheck: publicProcedure
		.route({
			tags: ["System"],
			summary: "Health check",
			description: "Returns OK if the server is running.",
		})
		.output(z.string())
		.handler(() => {
			return "OK";
		}),
	privateData: protectedProcedure
		.route({
			tags: ["System"],
			summary: "Get private data",
			description: "Returns authenticated user data. Requires a valid session.",
		})
		.output(
			z.object({
				message: z.string(),
				user: z.record(z.string(), z.unknown()).optional(),
			})
		)
		.handler(({ context }) => {
			return {
				message: "This is private",
				user: context.session?.user,
			};
		}),
	canManageOrganization: organizationPermissionProcedure({
		organization: ["update"],
	})
		.route({
			tags: ["System"],
			summary: "Check organization management permission",
			description:
				"Verify the current user has management access to the active organization.",
		})
		.output(
			z.object({
				canManageOrganization: z.boolean(),
				organizationId: z.string(),
				role: z.string(),
			})
		)
		.handler(({ context }) => {
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
	booking: bookingRouter,
	helpdesk: helpdeskRouter,
	intake: intakeRouter,
	notifications: notificationsRouter,
	telegram: telegramRouter,
	todo: todoRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
