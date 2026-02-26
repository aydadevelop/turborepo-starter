import { getGameChannelInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createGetGameChannelTool = (client: AppRouterClient) =>
	orpcTool(
		getGameChannelInputSchema,
		[
			"Fetch YouTube's auto-generated game metadata channel for a given video.",
			"Scrapes the YouTube watch page for the video and extracts the game's",
			"dedicated channel (UC…) from the gaming section renderer.",
			"",
			"Use this when you need to identify the official YouTube game channel for a title:",
			"  - Provide any YouTube videoId from a video that is tagged with the game.",
			"  - Returns { channelId, title } where channelId is the game's UC… channel ID.",
			"  - Returns null for non-gaming videos or if no game channel is present.",
			"",
			"IMPORTANT — this is NOT the same as a creator/uploader channel:",
			"  - The returned channelId is YouTube's game metadata page, NOT a person's upload channel.",
			"  - Do NOT use this channelId as scopeChannelId when creating a feed.",
			"  - Use ytSearchChannels to find a creator's channel for scopeChannelId.",
			"",
			"Typical workflow: search for a video about the game with ytSearchVideos,",
			"then pass one of its videoIds here to discover the game's YouTube channel.",
		].join("\n"),
		async (input) => {
			const result = await client.youtube.channels.getGameChannel({
				youtubeVideoId: input.youtubeVideoId,
			});
			if (!result) {
				return {
					found: false,
					message:
						"No game channel found for this video. The video may not be tagged as gaming content on YouTube.",
				};
			}
			return {
				found: true,
				channelId: result.channelId,
				title: result.title,
			};
		},
	);
