import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";
import z from "zod";

export const createRecoverStuckTool = (client: AppRouterClient) =>
	orpcMutationTool(
		z.object({
			minAgeMinutes: z
				.number()
				.int()
				.min(0)
				.max(120)
				.optional()
				.default(0)
				.describe(
					"Only recover videos stuck for at least this many minutes. 0 = recover all ingesting videos (useful after a deployment)."
				),
		}),
		"Re-queue all videos stuck in 'ingesting' status for this organization. Use after a worker deployment or outage that may have interrupted processing. minAgeMinutes=0 recovers everything currently in-flight; use 15+ to only target reliably stuck ones.",
		async (input) => {
			const result = await client.youtube.videos.recoverStuck(input);
			return { requeued: result.requeued };
		},
	);
