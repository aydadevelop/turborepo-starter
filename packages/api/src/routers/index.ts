import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import {
	fetchAccountInfo,
	fetchBalance,
	getProxy,
} from "@my-app/youtube/proxy-client";
import z from "zod";

import {
	organizationPermissionProcedure,
	protectedProcedure,
	publicProcedure,
} from "../index";
import { adminRouter } from "./admin/router";
import { consentRouter } from "./consent";
import { notificationsRouter } from "./notifications";
import { paymentsRouter } from "./payments";
import { tasksRouter } from "./tasks";
import { todoRouter } from "./todo";
import { youtubeRouter } from "./youtube/index";

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
	ping: publicProcedure
		.route({
			tags: ["System"],
			summary: "oRPC ping",
			description: "Public no-auth probe. Returns server timestamp and version. Useful for post-deploy verification.",
		})
		.output(
			z.object({
				ok: z.literal(true),
				ts: z.string().datetime(),
				v: z.string(),
			})
		)
		.handler(() => ({
			ok: true as const,
			ts: new Date().toISOString(),
			v: "1",
		})),
	proxyHealth: publicProcedure
		.route({
			tags: ["System"],
			summary: "Proxy health check",
			description: "Runs proxy client checks server-side and returns status. No auth required.",
		})
		.output(
			z.object({
				configured: z.boolean(),
				account: z
					.object({
						username: z.string(),
						status: z.number(),
						useFlow: z.number(),
						totalFlow: z.number(),
						whitelistedIps: z.array(z.string()),
					})
					.nullable(),
				balance: z.number().nullable(),
				proxy: z
					.object({ host: z.string(), port: z.number() })
					.nullable(),
				cooldownActive: z.boolean(),
				ts: z.string().datetime(),
			})
		)
		.handler(async ({ context }) => {
			const { twoCaptchaApiKey, ytProxyCacheKv } = context;
			if (!twoCaptchaApiKey) {
				return {
					configured: false,
					account: null,
					balance: null,
					proxy: null,
					cooldownActive: false,
					ts: new Date().toISOString(),
				};
			}

			const [account, balance, proxy] = await Promise.all([
				fetchAccountInfo(twoCaptchaApiKey, ytProxyCacheKv).catch(() => null),
				fetchBalance(twoCaptchaApiKey, ytProxyCacheKv).catch(() => null),
				getProxy(twoCaptchaApiKey, ytProxyCacheKv).catch(() => null),
			]);

			return {
				configured: true,
				account: account
					? {
							username: account.username,
							status: account.status,
							useFlow: account.useFlow,
							totalFlow: account.totalFlow,
							whitelistedIps: account.whitelistedIps,
						}
					: null,
				balance,
				proxy,
				cooldownActive: proxy === null && !!twoCaptchaApiKey,
				ts: new Date().toISOString(),
			};
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
	admin: adminRouter,
	consent: consentRouter,
	notifications: notificationsRouter,
	payments: paymentsRouter,
	tasks: tasksRouter,
	todo: todoRouter,
	youtube: youtubeRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
