import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createSemanticSearchTool = (client: AppRouterClient) =>
	tool({
		description:
			"Semantic search across extracted playtest signals with optional feed and type filters. Returns matching signals with video context, timestamps, and relevance scores. Does NOT search YouTube directly — only searches signals already in the database.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.describe(
					"Search query to match against signal text (e.g. 'camera bug', 'UI lag')"
				),
			feedId: z
				.string()
				.optional()
				.describe("Optional feed ID to filter signals to a specific feed"),
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
				.describe("Signal type filter"),
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
