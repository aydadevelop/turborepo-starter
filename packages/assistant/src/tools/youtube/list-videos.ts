import { listVideosInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createListVideosTool = (client: AppRouterClient) =>
	orpcTool(
		listVideosInputSchema.pick({ status: true, search: true, sortBy: true, sortDir: true, limit: true }),
			[
				"List YouTube videos being tracked for playtest feedback.",
				"Filter by status (candidate, approved, ingesting, ingested, failed, rejected).",
				"Use 'search' to find videos by title keyword.",
				"Use 'sortBy' (createdAt, publishedAt, viewCount) and 'sortDir' (asc, desc) to control ordering.",
				"Each result includes channelId — use it directly with ytCreateFeed or ytUpdateFeed to lock a feed to that channel without needing ytSearchChannels.",
			].join("\n"),
		async ({ status, search, sortBy, sortDir, limit }) => {
			const videos = await client.youtube.videos.list({
				status,
				search,
				sortBy,
				sortDir,
				limit,
				offset: 0,
			});
				return {
					count: videos.length,
					videos: videos.map((v) => ({
						id: v.id,
						youtubeVideoId: v.youtubeVideoId,
						title: v.title,
					uploaderChannelId: v.uploaderChannelId,
					uploaderChannelName: v.uploaderChannelName,
						gameChannelId: v.gameChannelId,
						viewCount: v.viewCount,
						publishedAt: v.publishedAt,
						status: v.status,
						createdAt: v.createdAt,
					})),
					tip: "uploaderChannelId = who made the video; gameChannelId = YouTube's auto-generated game metadata page. Use uploaderChannelId as scopeChannelId in ytCreateFeed to scope a feed to that creator.",
				};
		},
	);
