import { listClustersInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createListClustersTool = (client: AppRouterClient) =>
	orpcTool(
		listClustersInputSchema.pick({ state: true, type: true, severity: true, search: true, sortBy: true, sortDir: true, limit: true }),
		"List issue clusters from playtest feedback. Clusters group related signals (bugs, suggestions, UX issues) together. Use 'search' to find clusters by title/summary keyword. Use 'sortBy' to order by impactScore (default), signalCount, or createdAt. Supports filtering by state (open, acknowledged, in_progress, fixed, ignored, regression), type, and severity.",
		async (input) => {
			const clusters = await client.youtube.clusters.list({
				state: input.state,
				type: input.type,
				severity: input.severity,
				search: input.search,
				sortBy: input.sortBy,
				sortDir: input.sortDir,
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
	);
