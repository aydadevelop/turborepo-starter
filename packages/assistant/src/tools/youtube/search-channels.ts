import { searchChannelsInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createSearchChannelsTool = (client: AppRouterClient) =>
	orpcTool(
		searchChannelsInputSchema,
		[
			"Search YouTube for channels by name, keyword, or game title.",
			"Returns channelId, name, handle, subscriberCount, description, and channelType for each result.",
			"",
		"channelType tells you which feed mode to use for each channel:",
		'  - "creator" — real uploader channel. Use as scopeChannelId for sourceMode=user_channel_query.',
		'  - "topic"   — YouTube game aggregator page. Use as scopeChannelId for sourceMode=game_channel.',
		"              Same type ytGetGameChannel returns. Has a Videos tab with all game-tagged content.",
		'  - "unknown" — inspect before use.',
		].join("\n"),
		async (input) => {
			const channels = await client.youtube.channels.search({
				query: input.query,
				maxResults: input.maxResults,
			});
			return {
				count: channels.length,
				channels: channels.map((ch) => ({
					channelId: ch.channelId,
					name: ch.name,
					handle: ch.handle,
					subscriberCount: ch.subscriberCount,
					description: ch.description ? ch.description.slice(0, 200) : null,
					channelType: ch.channelType,
				})),
			};
		},
	);
