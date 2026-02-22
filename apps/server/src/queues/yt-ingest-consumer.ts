import { ytIngestQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytTranscript, ytVideo } from "@my-app/db/schema/youtube";
import { and, eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 3;

interface QueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

interface R2BucketLike {
	put(key: string, value: ArrayBuffer | string): Promise<unknown>;
}

interface YtIngestDependencies {
	ytNlpQueue?: QueueProducer;
	ytTranscribeQueue?: QueueProducer;
	ytTranscriptsBucket?: R2BucketLike;
	ytVectorizeQueue?: QueueProducer;
}

const handleIngestMessage = async (
	queueMessage: Message,
	dependencies: YtIngestDependencies
) => {
	const parsed = ytIngestQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-ingest] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { videoId, organizationId, youtubeVideoId, forceAsr } = parsed.data;

	try {
		// Mark video as ingesting
		await db
			.update(ytVideo)
			.set({ status: "ingesting" })
			.where(
				and(eq(ytVideo.id, videoId), eq(ytVideo.organizationId, organizationId))
			);

		console.log(
			`[yt-ingest] Processing video ${youtubeVideoId} (id: ${videoId}, forceAsr: ${forceAsr})`
		);

		// Create transcript record
		const transcriptId = crypto.randomUUID();

		if (forceAsr) {
			// ── ASR path: download audio → store in R2 → dispatch to transcribe queue ──
			// NOTE: In production, use @my-app/youtube/download-audio here.
			// import { downloadAudio } from "@my-app/youtube/download-audio";
			// const { buffer, contentType, extension } = await downloadAudio({ youtubeVideoId });
			console.log(
				`[yt-ingest] ASR path: downloading audio for ${youtubeVideoId}`
			);

			const audioR2Key = `audio/${organizationId}/${videoId}.m4a`;
			const audioContentType = "audio/mp4";

			// Store audio in R2
			if (dependencies.ytTranscriptsBucket) {
				// Placeholder: real implementation writes actual audio bytes
				await dependencies.ytTranscriptsBucket.put(audioR2Key, "");
			}

			// Create empty transcript — will be filled by transcribe consumer
			await db.insert(ytTranscript).values({
				id: transcriptId,
				videoId,
				organizationId,
				source: "whisper_asr",
				language: "en",
				fullText: "",
			});

			// Mark video as ingested (audio uploaded, pending transcription)
			await db
				.update(ytVideo)
				.set({ status: "ingested", ingestedAt: new Date() })
				.where(eq(ytVideo.id, videoId));

			// Dispatch to transcribe queue
			if (dependencies.ytTranscribeQueue) {
				await dependencies.ytTranscribeQueue.send(
					{
						kind: "yt.transcribe.v1" as const,
						transcriptId,
						videoId,
						organizationId,
						audioR2Key,
						contentType: audioContentType,
					},
					{ contentType: "json" }
				);
			}
		} else {
			// ── Captions path: fetch subtitles → store transcript → dispatch nlp/vectorize ──
			// NOTE: In production, use @my-app/youtube/subtitles here.
			// import { fetchSubtitles } from "@my-app/youtube/subtitles";
			console.log(
				`[yt-ingest] Captions path: fetching subtitles for ${youtubeVideoId}`
			);

			await db.insert(ytTranscript).values({
				id: transcriptId,
				videoId,
				organizationId,
				source: "youtube_captions",
				language: "en",
				fullText: "", // Will be filled by actual implementation
			});

			// Mark video as ingested
			await db
				.update(ytVideo)
				.set({ status: "ingested", ingestedAt: new Date() })
				.where(eq(ytVideo.id, videoId));

			// Dispatch to vectorize & NLP queues directly
			const dispatchMessage = {
				transcriptId,
				videoId,
				organizationId,
			};

			if (dependencies.ytVectorizeQueue) {
				await dependencies.ytVectorizeQueue.send(
					{ kind: "yt.vectorize.v1" as const, ...dispatchMessage },
					{ contentType: "json" }
				);
			}

			if (dependencies.ytNlpQueue) {
				await dependencies.ytNlpQueue.send(
					{ kind: "yt.nlp.v1" as const, ...dispatchMessage },
					{ contentType: "json" }
				);
			}
		}

		queueMessage.ack();
	} catch (error) {
		console.error(`[yt-ingest] Failed to ingest video ${videoId}:`, error);

		// Mark video as failed
		await db
			.update(ytVideo)
			.set({
				status: "failed",
				failureReason: error instanceof Error ? error.message : "Unknown error",
				failedStage: "ingest",
			})
			.where(eq(ytVideo.id, videoId));

		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 60, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtIngestBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtIngestDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleIngestMessage(queueMessage, dependencies);
	}
};
