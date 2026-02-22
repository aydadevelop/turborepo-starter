import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createTriggerDiscoveryTool = (client: AppRouterClient) =>
	tool({
		description:
			"Trigger video discovery for a feed. This enqueues a background job that searches YouTube for new videos matching the feed's search query and stop words. Use after setting up a feed or when you want fresh results.",
		inputSchema: z.object({
			feedId: z
				.string()
				.min(1)
				.describe("The feed ID to trigger discovery for"),
		}),
		execute: async (input) => {
			const result = await client.youtube.videos.triggerDiscovery({
				feedId: input.feedId,
			});
			return {
				queued: result.queued,
				message: result.queued
					? "Discovery job queued. New videos will appear shortly."
					: "Discovery could not be queued.",
			};
		},
	});
