import { ytSignalTypeSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createSearchSignalsTool = (client: AppRouterClient) =>
	tool({
		description:
			"Search YouTube playtest feedback signals. Use this to find bug reports, player suggestions, UX issues, and other feedback extracted from gameplay video transcripts. Supports text search and filtering by type/severity.",
		inputSchema: z.object({
			query: z.string().min(1).describe("Search query text"),
			type: ytSignalTypeSchema.optional().describe("Filter by signal type"),
			limit: z.number().int().min(1).max(50).default(10),
		}),
		execute: async (input) => {
			const results = await client.youtube.search.semantic(input);
			return {
				count: results.length,
				results: results.map((r) => ({
					signalId: r.signalId,
					text: r.text,
					type: r.type,
					severity: r.severity,
					videoTitle: r.videoTitle,
					youtubeVideoId: r.youtubeVideoId,
					timestampStart: r.timestampStart,
					score: r.score,
				})),
			};
		},
	});
