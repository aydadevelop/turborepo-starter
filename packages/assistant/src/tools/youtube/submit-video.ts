import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createSubmitVideoTool = (client: AppRouterClient) =>
	tool({
		description:
			"Submit a YouTube video URL for playtest feedback extraction. The video will be added as a candidate for review. Requires a valid YouTube URL and a feed ID to associate with.",
		inputSchema: z.object({
			youtubeUrl: z
				.string()
				.url()
				.describe("YouTube video URL (youtube.com or youtu.be)"),
			feedId: z.string().min(1).describe("Feed ID to associate the video with"),
		}),
		execute: async (input) => {
			const result = await client.youtube.videos.submit(input);
			return {
				id: result.id,
				youtubeVideoId: result.youtubeVideoId,
				title: result.title,
				status: result.status,
			};
		},
	});
