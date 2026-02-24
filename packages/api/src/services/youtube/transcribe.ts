import { db } from "@my-app/db";
import { ytTranscript } from "@my-app/db/schema/youtube";
import { eq } from "drizzle-orm";
import {
	type QueueProducer,
	type R2ReadableBucketLike,
	type YtTranscribeQueueMessage,
	ytQueueKinds,
} from "../../contracts/youtube-queue";

export interface YtTranscribeDependencies {
	ytNlpQueue?: QueueProducer;
	ytTranscriptsBucket?: R2ReadableBucketLike;
}

export type ProcessYtTranscribeMessageResult = "processed" | "audio_missing";

export interface ProcessYtTranscribeMessageOptions {
	dependencies: YtTranscribeDependencies;
	message: YtTranscribeQueueMessage;
}

export const processYtTranscribeMessage = async ({
	message,
	dependencies,
}: ProcessYtTranscribeMessageOptions): Promise<ProcessYtTranscribeMessageResult> => {
	const { transcriptId, videoId, organizationId, audioR2Key, contentType } =
		message;

	if (!dependencies.ytTranscriptsBucket) {
		throw new Error("YT_TRANSCRIPTS_BUCKET binding is not available");
	}

	// 1. Read audio from R2
	const object = await dependencies.ytTranscriptsBucket.get(audioR2Key);
	if (!object) {
		return "audio_missing";
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

	// Pipeline: transcribe → NLP → vectorize → cluster (sequential)
	if (dependencies.ytNlpQueue) {
		await dependencies.ytNlpQueue.send(
			{ kind: ytQueueKinds.nlp, ...dispatchMessage },
			{ contentType: "json" }
		);
	}

	return "processed";
};
