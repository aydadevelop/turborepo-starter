import { ytVideoStatusSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createListVideosTool = (client: AppRouterClient) =>
	tool({
		description:
			"List YouTube videos being tracked for playtest feedback. Can filter by status (candidate, approved, ingesting, ingested, failed, rejected) to see pending reviews, completed ingestions, or failures.",
		inputSchema: z.object({
			status: ytVideoStatusSchema
				.optional()
				.describe("Filter by video processing status"),
			limit: z.number().int().min(1).max(50).default(20),
		}),
		execute: async (input) => {
			const videos = await client.youtube.videos.list({
				status: input.status,
				limit: input.limit,
				offset: 0,
			});
			return {
				count: videos.length,
				videos: videos.map((v) => ({
					id: v.id,
					youtubeVideoId: v.youtubeVideoId,
					title: v.title,
					channelName: v.channelName,
					status: v.status,
					createdAt: v.createdAt,
				})),
			};
		},
	});
