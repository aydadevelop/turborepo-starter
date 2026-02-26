import type { AppRouterClient } from "@my-app/api/routers";
import { tool } from "ai";
import { z } from "zod";

const inputSchema = z.object({
	videoId: z.string().describe("The internal video ID to investigate"),
});

/**
 * Compound tool that fetches video metadata, transcript, and extracted signals
 * in a single tool call. Saves 2-3 steps compared to calling each tool individually.
 *
 * Transcript + signals are fetched in parallel after resolving the video.
 * Each sub-fetch is fault-tolerant — partial data is returned if one fails.
 */
export const createInvestigateVideoTool = (client: AppRouterClient) =>
	tool({
		description:
		"Deep investigation of a single video: fetches metadata (including channelId and gameChannelId), full transcript (with timed segments), and all extracted signals in one call. Use this instead of calling ytListVideos + ytGetTranscript + ytListSignals separately. gameChannelId is the game's dedicated YouTube channel (UC…) — extracted live from the YouTube watch page when not already known. Use it with ytCreateFeed to create a channel-scoped feed. Takes 30-150 seconds depending on transcript size.",
		inputSchema,
		execute: async ({ videoId }) => {
			// Fetch video, transcript, and signals in parallel
			const [videoResult, transcriptResult, signalsResult] =
				await Promise.allSettled([
					client.youtube.videos.list({
						id: videoId,
						limit: 1,
						offset: 0,
					}),
					client.youtube.transcripts.get({ videoId }),
					client.youtube.signals.list({
						videoId,
						limit: 100,
						offset: 0,
					}),
				]);

			// ── Video ──
			let video: Record<string, unknown> | null = null;
			if (videoResult.status === "fulfilled" && videoResult.value.length > 0) {
				const v = videoResult.value[0]!;

				// If gameChannelId is missing, fetch it live from the YouTube watch page via the API
				let gameChannelId = v.gameChannelId;
				let gameTitle: string | null = null;
				if (!gameChannelId && v.youtubeVideoId) {
					const gc = await client.youtube.channels
						.getGameChannel({ youtubeVideoId: v.youtubeVideoId })
						.catch(() => null);
					if (gc) {
						gameChannelId = gc.channelId;
						gameTitle = gc.title;
					}
				}

				video = {
					id: v.id,
					youtubeVideoId: v.youtubeVideoId,
					title: v.title,
					uploaderChannelId: v.uploaderChannelId,
					uploaderChannelName: v.uploaderChannelName,
					gameChannelId,
					...(gameTitle ? { gameTitle } : {}),
					viewCount: v.viewCount,
					publishedAt: v.publishedAt,
					status: v.status,
					createdAt: v.createdAt,
				};
			}

			// ── Transcript ──
			let transcript: Record<string, unknown> | null = null;
			if (
				transcriptResult.status === "fulfilled" &&
				transcriptResult.value
			) {
				const t = transcriptResult.value;
				transcript = {
					id: t.id,
					source: t.source,
					language: t.language,
					nlpStatus: t.nlpStatus,
					durationSeconds: t.durationSeconds,
					segmentCount: t.segmentCount,
					segments: t.timedSegments,
				};
			}

			// ── Signals ──
			let signals: Record<string, unknown>[] = [];
			if (signalsResult.status === "fulfilled") {
				signals = signalsResult.value.map((s) => ({
					id: s.id,
					type: s.type,
					text: s.text,
					severityScore: s.severityScore,
					confidence: s.confidence,
					component: s.component,
					reasoning: s.reasoning,
					timestampStart: s.timestampStart,
					timestampEnd: s.timestampEnd,
					clusterId: s.clusterId,
				}));
			}

			return {
				video,
				transcript,
				signalCount: signals.length,
				signals,
				errors: {
					video:
						videoResult.status === "rejected"
							? String(videoResult.reason)
							: null,
					transcript:
						transcriptResult.status === "rejected"
							? String(transcriptResult.reason)
							: null,
					signals:
						signalsResult.status === "rejected"
							? String(signalsResult.reason)
							: null,
				},
			};
		},
	});
