import type { AppRouterClient } from "@my-app/api/routers";
import z from "zod";
import { orpcTool } from "../../lib/orpc-tool";

export const createListFeedsTool = (client: AppRouterClient) =>
	orpcTool(
		z.object({}),
		"List all YouTube discovery feeds configured for this organization. Returns feed id, name, gameTitle, sourceMode, searchQuery, scopeChannelId, scopeChannelName, playlistId, searchStopWords, titleStopWords, status, and timestamps. Always call this first when the user asks about feeds, or when you need a feedId for another operation.",
		async () => {
			const feeds = await client.youtube.feeds.list();
			return {
				count: feeds.length,
				feeds: feeds.map((f) => ({
					id: f.id,
					name: f.name,
					gameTitle: f.gameTitle,
					sourceMode: f.sourceMode,
					searchQuery: f.searchQuery,
					scopeChannelId: f.scopeChannelId,
					scopeChannelName: f.scopeChannelName,
					playlistId: f.playlistId,
					searchStopWords: f.searchStopWords,
					titleStopWords: f.titleStopWords,
					status: f.status,
					lastDiscoveryAt: f.lastDiscoveryAt,
					createdAt: f.createdAt,
				})),
			};
		}
	);
