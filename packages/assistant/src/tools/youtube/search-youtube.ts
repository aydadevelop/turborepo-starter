import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createSearchYouTubeTool = (client: AppRouterClient) =>
	tool({
		description:
			"Search YouTube for videos matching a query. Use this to discover new playtest feedback videos before submitting them for processing. Returns YouTube video metadata including titles, channels, and view counts.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.describe("Search query (e.g. 'Starforge Arena playtest feedback')"),
			feedId: z
				.string()
				.optional()
				.describe("Optional feed ID to filter results or context"),
			type: z
				.enum([
					"bug",
					"ux_friction",
					"confusion",
					"praise",
					"suggestion",
					"performance",
					"crash",
					"exploit",
					"other",
				])
				.optional()
				.describe("Signal type filter for semantic search"),
			limit: z.number().int().min(1).max(50).default(10),
		}),
		execute: async (input) => {
			const results = await client.youtube.search.semantic({
				query: input.query,
				feedId: input.feedId,
				type: input.type,
				limit: input.limit,
			});

			if (results.length > 0) {
				return {
					source: "database",
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
						youtubeUrl: `https://youtube.com/watch?v=${r.youtubeVideoId}${r.timestampStart ? `&t=${r.timestampStart}` : ""}`,
					})),
				};
			}

			return {
				source: "database",
				count: 0,
				results: [],
				suggestion:
					"No matching signals found. Try a broader query, or trigger discovery on a feed to import new videos.",
			};
		},
	});
