import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";
import z from "zod";

export const createAdminRecoverStuckTool = (client: AppRouterClient) =>
	orpcMutationTool(
		z.object({
			minAgeMinutes: z
				.number()
				.int()
				.min(0)
				.max(120)
				.optional()
				.default(0)
				.describe("Minimum age in minutes before a video is considered stuck. 0 = recover all."),
		}),
		"[Admin] Re-queue all videos stuck in 'ingesting' across ALL organizations. Use after worker deployments or outages. Prefer ytRecoverStuck for single-org recovery; use this for system-wide recovery.",
		async (input) => {
			const result = await client.admin.youtube.recoverStuck(input);
			return { requeued: result.requeued };
		},
	);
