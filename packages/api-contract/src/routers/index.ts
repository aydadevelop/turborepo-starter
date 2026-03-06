import type { ContractRouterClient } from "@orpc/contract";
import { oc } from "@orpc/contract";
import z from "zod";
import { adminContract } from "./admin/router";
import { consentContract } from "./consent";
import { contaktlyContract } from "./contaktly";
import { notificationsContract } from "./notifications";
import { paymentsContract } from "./payments";
import { tasksContract } from "./tasks";
import { todoContract } from "./todo";

export const appContract = {
	healthCheck: oc
		.route({
			tags: ["System"],
			summary: "Health check",
			description: "Returns OK if the server is running.",
		})
		.output(z.string()),

	ping: oc
		.route({
			tags: ["System"],
			summary: "oRPC ping",
			description:
				"Public no-auth probe. Returns server timestamp and version. Useful for post-deploy verification.",
		})
		.output(
			z.object({
				ok: z.literal(true),
				ts: z.string().datetime(),
				v: z.string(),
			})
		),

	privateData: oc
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
		),

	canManageOrganization: oc
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
		),

	admin: adminContract,
	contaktly: contaktlyContract,
	consent: consentContract,
	notifications: notificationsContract,
	payments: paymentsContract,
	tasks: tasksContract,
	todo: todoContract,
};

export type AppContract = typeof appContract;
export type AppContractClient = ContractRouterClient<typeof appContract>;
