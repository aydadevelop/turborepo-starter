import { searchYouTubeVideosInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createSearchVideosTool = (client: AppRouterClient) =>
	orpcTool(
		searchYouTubeVideosInputSchema,
		[
			"Search YouTube for videos matching a keyword query. Returns video titles, channel IDs/names, durations, view counts, and publish dates.",
			"",
			"Use cases:",
			"• Explore what content exists for a game before creating a feed.",
			"• Identify relevant channels (channelId) from video results to lock a feed to.",
			"• Spot irrelevant titles to derive stop words for a feed.",
			"• Use the 'duration' filter (short/medium/long) to focus on full gameplay videos.",
			"• Pass 'stopWords' to exclude known irrelevant terms from results.",
		].join("\n"),
		async (input) => {
			const results = await client.youtube.channels.searchVideos(input);
			// Group channels for easy identification
			const channelCounts = new Map<string, { name: string | null; count: number }>();
			for (const r of results) {
				if (r.channelId) {
					const entry = channelCounts.get(r.channelId);
					if (entry) {
						entry.count++;
					} else {
						channelCounts.set(r.channelId, { name: r.channelName, count: 1 });
					}
				}
			}

			return {
				count: results.length,
				videos: results.map((r) => ({
					youtubeVideoId: r.youtubeVideoId,
					title: r.title,
					channelId: r.channelId,
					channelName: r.channelName,
					duration: r.duration,
					viewCount: r.viewCount,
					publishedAt: r.publishedAt,
				})),
				topChannels: [...channelCounts.entries()]
					.sort((a, b) => b[1].count - a[1].count)
					.slice(0, 5)
					.map(([id, info]) => ({
						channelId: id,
						channelName: info.name,
						videoCount: info.count,
					})),
			};
		},
	);
