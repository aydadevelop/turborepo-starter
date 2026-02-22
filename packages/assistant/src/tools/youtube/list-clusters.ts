import {
	ytClusterStateSchema,
	ytSignalSeveritySchema,
	ytSignalTypeSchema,
} from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createListClustersTool = (client: AppRouterClient) =>
	tool({
		description:
			"List issue clusters from playtest feedback. Clusters group related signals (bugs, suggestions, UX issues) together, ordered by impact score. Use to understand top issues reported by players. Supports filtering by state (open, acknowledged, in_progress, fixed, ignored, regression), type, and severity.",
		inputSchema: z.object({
			state: ytClusterStateSchema
				.optional()
				.describe("Filter by cluster state"),
			type: ytSignalTypeSchema.optional().describe("Filter by issue type"),
			severity: ytSignalSeveritySchema
				.optional()
				.describe("Filter by severity"),
			limit: z.number().int().min(1).max(50).default(20),
		}),
		execute: async (input) => {
			const clusters = await client.youtube.clusters.list({
				state: input.state,
				type: input.type,
				severity: input.severity,
				limit: input.limit,
				offset: 0,
			});
			return {
				count: clusters.length,
				clusters: clusters.map((c) => ({
					id: c.id,
					title: c.title,
					summary: c.summary,
					state: c.state,
					type: c.type,
					severity: c.severity,
					signalCount: c.signalCount,
					impactScore: c.impactScore,
					component: c.component,
				})),
			};
		},
	});
