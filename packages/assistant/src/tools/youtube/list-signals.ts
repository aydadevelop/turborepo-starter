import {
	listSignalsInputSchema,
} from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createListSignalsTool = (client: AppRouterClient) =>
	orpcTool(
		listSignalsInputSchema.pick({
			videoId: true,
			feedId: true,
			type: true,
			severity: true,
			clusterId: true,
			search: true,
			sortBy: true,
			sortDir: true,
			limit: true,
		}),
		"List extracted feedback signals (bugs, suggestions, UX issues, etc.) with rich filtering. Filter by videoId, feedId, type, severity, or clusterId. Use 'search' for keyword match on signal text. sortBy: 'createdAt' (default), 'confidence', or 'severityScore'. Prefer ytSemanticSearch for free-text queries; use this for structured browsing and pagination.",
		async (input) => {
			const signals = await client.youtube.signals.list({
				...input,
				offset: 0,
			});
			return {
				count: signals.length,
				signals: signals.map((s) => ({
					id: s.id,
					videoId: s.videoId,
					type: s.type,
					text: s.text,
					severityScore: s.severityScore,
					confidence: s.confidence,
					component: s.component,
					reasoning: s.reasoning,
					timestampStart: s.timestampStart,
					timestampEnd: s.timestampEnd,
					clusterId: s.clusterId,
					createdAt: s.createdAt,
				})),
			};
		},
	);
