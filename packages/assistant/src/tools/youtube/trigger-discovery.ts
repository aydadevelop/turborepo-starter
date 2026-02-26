import { triggerDiscoveryInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

export const createTriggerDiscoveryTool = (client: AppRouterClient) =>
	orpcMutationTool(
		triggerDiscoveryInputSchema,
		"Trigger video discovery for a feed. This enqueues a background job that searches YouTube for new videos matching the feed's search query and stop words. Use after setting up a feed or when you want fresh results.",
		async (input) => {
			const result = await client.youtube.videos.triggerDiscovery(input);
			return {
				queued: result.queued,
				message: result.queued
					? "Discovery job queued. New videos will appear shortly."
					: "Discovery could not be queued.",
			};
		},
	);
