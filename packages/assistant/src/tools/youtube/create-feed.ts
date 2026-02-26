import { createFeedInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { llmSafe, orpcMutationTool } from "../../lib/orpc-tool";

export const createCreateFeedTool = (client: AppRouterClient) =>
	orpcMutationTool(
		// llmSafe strips top-level null values to undefined so Zod's .optional()
		// fields don't reject the LLM's null-filled JSON before superRefine runs.
		llmSafe(createFeedInputSchema),
		[
			"Create a new YouTube discovery feed.",
			"sourceMode is REQUIRED and controls exactly one discovery mode:",
			"- playlist: playlistId required",
			"- user_channel_query: scopeChannelId + searchQuery required",
			"- game_channel: scopeChannelId required, no searchQuery. Use a topic-type channel: either the channelId from ytGetGameChannel, or from ytSearchChannels where channelType='topic'. Topic channels ARE the correct scopeChannelId for this mode — they aggregate all videos tagged to the game.",
			"- search: searchQuery required, no scopeChannelId/playlistId",
			"To cover both a channel and broad search, create TWO feeds.",
			"IMPORTANT — playlistId rules:",
			"  - ONLY set playlistId if the user provided an actual YouTube playlist URL (youtube.com/playlist?list=PLxxx).",
			"  - NEVER invent, guess, or fabricate a playlist ID. If you do not have a real playlist URL, leave playlistId unset.",
			"  - For monitoring a channel or topic, use searchQuery and/or scopeChannelId instead.",
			"IMPORTANT — scopeChannelId rules:",
			"  - For user_channel_query: use a creator channel (channelType='creator') from ytSearchChannels or topChannels in ytSearchVideos.",
			"  - For game_channel: use a topic channel (channelType='topic') from ytSearchChannels or ytGetGameChannel.",
			"  - Always provide scopeChannelName alongside scopeChannelId (the channel display name).",
			"searchStopWords are query exclusions and only apply for sourceMode=search.",
			"titleStopWords are post-fetch title filters and apply for all source modes.",
			"After creating, call ytTriggerDiscovery to start the first scan.",
		].join("\n"),
		async (input) => {
			const feed = await client.youtube.feeds.create(input);
			return {
				id: feed.id,
				name: feed.name,
				gameTitle: feed.gameTitle,
				sourceMode: feed.sourceMode,
				searchQuery: feed.searchQuery,
				scopeChannelId: feed.scopeChannelId,
				playlistId: feed.playlistId,
				searchStopWords: feed.searchStopWords,
				titleStopWords: feed.titleStopWords,
				status: feed.status,
				createdAt: feed.createdAt,
			};
		}
	);
