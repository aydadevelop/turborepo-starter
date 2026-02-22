import { ytTranscribeQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytTranscript } from "@my-app/db/schema/youtube";
import { eq } from "drizzle-orm";

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
	get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

interface YtTranscribeDependencies {
	ytNlpQueue?: QueueProducer;
	ytTranscriptsBucket?: R2BucketLike;
	ytVectorizeQueue?: QueueProducer;
}

const handleTranscribeMessage = async (
	queueMessage: Message,
	dependencies: YtTranscribeDependencies
) => {
	const parsed = ytTranscribeQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-transcribe] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { transcriptId, videoId, organizationId, audioR2Key, contentType } =
		parsed.data;

	try {
		if (!dependencies.ytTranscriptsBucket) {
			throw new Error("YT_TRANSCRIPTS_BUCKET binding is not available");
		}

		// 1. Read audio from R2
		const object = await dependencies.ytTranscriptsBucket.get(audioR2Key);
		if (!object) {
			console.error(
				`[yt-transcribe] Audio not found in R2 at key: ${audioR2Key}`
			);
			queueMessage.ack();
			return;
		}

		const audioBuffer = await object.arrayBuffer();

		// 2. Transcribe via Whisper
		// NOTE: In production, call OpenAI Whisper API here with the audio buffer.
		// import { transcribeAudio } from "@my-app/youtube/transcribe";
		// const result = await transcribeAudio(audioBuffer, { contentType }, { apiKey });
		console.log(
			`[yt-transcribe] Transcribing ${audioR2Key} (${audioBuffer.byteLength} bytes, ${contentType})`
		);

		// 3. Update transcript record with the transcribed text
		// Placeholder: real implementation stores Whisper output
		await db
			.update(ytTranscript)
			.set({
				source: "whisper_asr",
				fullText: "", // Will be filled by actual Whisper call
			})
			.where(eq(ytTranscript.id, transcriptId));

		// 4. Dispatch to downstream queues
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

		queueMessage.ack();
	} catch (error) {
		console.error(
			`[yt-transcribe] Failed to transcribe ${transcriptId}:`,
			error
		);
		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 120, 600),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtTranscribeBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtTranscribeDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleTranscribeMessage(queueMessage, dependencies);
	}
};
