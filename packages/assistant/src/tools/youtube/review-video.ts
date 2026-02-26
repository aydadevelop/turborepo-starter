import { reviewVideoInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

export const createReviewVideoTool = (client: AppRouterClient) =>
	orpcMutationTool(
		reviewVideoInputSchema,
		[
			"Approve or reject a single candidate video.",
			"For multiple videos at once, use ytReviewVideosBatch instead.",
			"videoId is the internal `id` field from ytListVideos — NOT the YouTube video ID.",
			"You do NOT need to investigate a video before approving — approve by title/channel if the topic is obvious.",
			"Provide rejectionReason when action='reject'.",
		].join("\n"),
		async (input) => {
			const result = await client.youtube.videos.review(input);
			return {
				success: result.success,
				newStatus: result.status,
				action: input.action,
				videoId: input.videoId,
			};
		},
	);
