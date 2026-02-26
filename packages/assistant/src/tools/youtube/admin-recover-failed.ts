import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";
import z from "zod";

export const createAdminRecoverFailedTool = (client: AppRouterClient) =>
	orpcMutationTool(
		z.object({
			minAgeMinutes: z
				.number()
				.int()
				.min(0)
				.max(60)
				.optional()
				.default(5)
				.describe("Only recover videos that failed at least this many minutes ago."),
		}),
		"[Admin] Re-queue transiently-failed videos (proxy timeouts, LOGIN_REQUIRED, rate limits, server errors) across all organizations. Permanently failed videos (removed/private/unavailable) are left untouched. Returns counts of requeued and skipped videos.",
		async (input) => {
			const result = await client.admin.youtube.recoverFailed(input);
			return { requeued: result.requeued, skipped: result.skipped };
		},
	);
