import { retriggerNlpInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

export const createRetriggerNlpTool = (client: AppRouterClient) =>
	orpcMutationTool(
		retriggerNlpInputSchema,
		"Re-run NLP signal extraction for a video that has already been ingested. Deletes all existing signals for the video and re-queues it for fresh LLM analysis. Use when the extraction model was updated or when signals look incorrect. Requires the video to have an existing transcript.",
		async (input) => {
			const result = await client.youtube.signals.retriggerNlp(input);
			return {
				queued: result.queued,
				deletedSignals: result.deletedSignals,
				videoId: input.videoId,
			};
		},
	);
