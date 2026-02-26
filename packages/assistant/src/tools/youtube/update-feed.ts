import { updateFeedInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

export const createUpdateFeedTool = (client: AppRouterClient) =>
	orpcMutationTool(
		// llmSafe strips top-level nulls to undefined. Fields that are intentionally
		// nullable (scopeChannelId, playlistId, etc.) are already .nullable() in the
		// schema, so Zod will reject the stripped undefined for those — meaning the
		// LLM must explicitly pass null only for fields it wants to clear.
		llmSafe(updateFeedInputSchema),
		[
			"Update a YouTube discovery feed. Only provided fields are changed.",
			"When changing source mode, set sourceMode plus required fields:",
			"- playlist: playlistId",
			"- user_channel_query: scopeChannelId + searchQuery",
			"- game_channel: scopeChannelId",
			"- search: searchQuery",
			"Set scopeChannelId/playlistId/searchStopWords/titleStopWords to null to remove them.",
			"IMPORTANT — playlistId: ONLY set if the user provided an actual YouTube playlist URL. NEVER invent or guess a playlist ID.",
			"scopeChannelId is the UC… channel to crawl (creator or publisher) — get it from ytSearchVideos.topChannels or ytSearchChannels.",
			"When setting scopeChannelId, also provide scopeChannelName (the channel display name) so it is stored.",
			"searchStopWords are query exclusions only for sourceMode=search.",
			"titleStopWords are post-fetch title filters for all source modes.",
			"After updating, run ytTriggerDiscovery to pick up fresh results.",
		].join("\n"),
		async (input) => {
			await client.youtube.feeds.update(input);
			return {
				success: true,
				feedId: input.feedId,
				updated: Object.keys(input).filter((k) => k !== "feedId"),
			};
		}
	);
