import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createUpdateClusterStateTool = (client: AppRouterClient) =>
	tool({
		description:
			"Update the state of a feedback issue cluster (Sentry-like workflow). Transitions: open → acknowledged → in_progress → fixed. Can also mark as ignored or regression.",
		inputSchema: z.object({
			clusterId: z.string().min(1).describe("ID of the cluster to update"),
			state: z
				.enum([
					"open",
					"acknowledged",
					"in_progress",
					"fixed",
					"ignored",
					"regression",
				])
				.describe("New state for the cluster"),
			fixedInVersion: z
				.string()
				.optional()
				.describe("Game version where the issue was fixed"),
			externalIssueUrl: z
				.string()
				.url()
				.optional()
				.describe("URL to external issue tracker (e.g. Jira, GitHub)"),
			externalIssueId: z
				.string()
				.optional()
				.describe("External issue tracker ID"),
		}),
		execute: async (input) => {
			const result = await client.youtube.clusters.updateState(input);
			return result;
		},
	});
