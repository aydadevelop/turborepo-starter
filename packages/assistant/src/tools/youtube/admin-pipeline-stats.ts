import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";
import z from "zod";

export const createAdminPipelineStatsTool = (client: AppRouterClient) =>
	orpcTool(
		z.object({}),
		"[Admin] Get pipeline health stats: video counts by status (candidate, approved, ingesting, ingested, failed, rejected) across all organizations. Use to assess the overall ingestion pipeline health.",
		async () => {
			const stats = await client.admin.youtube.pipelineStats();
			return stats;
		},
	);
