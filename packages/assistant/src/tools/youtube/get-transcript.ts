import { getTranscriptInputSchema } from "@my-app/api/contracts/youtube";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcTool } from "../../lib/orpc-tool";

export const createGetTranscriptTool = (client: AppRouterClient) =>
	orpcTool(
		getTranscriptInputSchema,
		"Get the full transcript for an ingested video, including timed segments with start/end timestamps. Use to read what was said in a video before searching for signals. Returns null if the video hasn't been ingested yet or has no transcript.",
		async (input) => {
			const transcript = await client.youtube.transcripts.get(input);
			if (!transcript) {
				return {
					found: false,
					message: "No transcript found — video may not be ingested yet.",
				};
			}
			return {
				found: true,
				id: transcript.id,
				videoId: transcript.videoId,
				source: transcript.source,
				language: transcript.language,
				nlpStatus: transcript.nlpStatus,
				durationSeconds: transcript.durationSeconds,
				segmentCount: transcript.segmentCount,
				segments: transcript.timedSegments,
			};
		},
	);
