import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";
import z from "zod";

export const createDeleteFeedTool = (client: AppRouterClient) =>
	orpcMutationTool(
		z.object({
			feedId: z.string().trim().min(1).describe("ID of the feed to delete"),
		}),
		"Permanently delete a YouTube discovery feed and all associated videos, transcripts, and signals. This is irreversible — confirm with the user before proceeding. Use ytListFeeds to get the feedId if not known.",
		async (input) => {
			await client.youtube.feeds.delete({ feedId: input.feedId });
			return { success: true, deletedFeedId: input.feedId };
		},
	);
