import { submitVideoInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

export const createSubmitVideoTool = (client: AppRouterClient) =>
	orpcMutationTool(
		submitVideoInputSchema,
		"Submit a YouTube video URL for playtest feedback extraction. The video will be added as a candidate for review. Requires a valid YouTube URL and a feed ID to associate with.",
		async (input) => {
			const result = await client.youtube.videos.submit(input);
			return {
				id: result.id,
				youtubeVideoId: result.youtubeVideoId,
				title: result.title,
				status: result.status,
			};
		},
	);
