import { semanticSearchInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createSemanticSearchTool = (client: AppRouterClient) =>
	orpcTool(
		semanticSearchInputSchema,
		"Semantic search across extracted playtest signals with optional feed, type, severity, and component filters. Returns matching signals with video context, timestamps, and relevance scores. Does NOT search YouTube directly — only searches signals already in the database.",
		async (input) => {
			const results = await client.youtube.search.semantic({
				query: input.query,
				feedId: input.feedId,
				type: input.type,
				severity: input.severity,
				component: input.component,
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
						component: r.component,
						reasoning: r.reasoning,
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
	);
