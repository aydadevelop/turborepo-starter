import { retryIngestInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

export const createRetryIngestTool = (client: AppRouterClient) =>
	orpcMutationTool(
		retryIngestInputSchema,
		"Retry ingestion for a video that failed processing. Resets the video status to 'approved' and re-queues it for transcript extraction. Only works on videos with status='failed'. Use ytListVideos with status='failed' to find candidates.",
		async (input) => {
			await client.youtube.videos.retryIngest(input);
			return { success: true, videoId: input.videoId, newStatus: "approved" };
		},
	);
