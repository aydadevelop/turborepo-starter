import { ytTranscribeQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import {
	processYtTranscribeMessage,
	type YtTranscribeDependencies,
} from "@my-app/api/services/youtube/transcribe";

const MAX_RETRY_ATTEMPTS = 3;

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

	const { transcriptId, audioR2Key } = parsed.data;

	try {
		const result = await processYtTranscribeMessage({
			message: parsed.data,
			dependencies,
		});

		if (result === "audio_missing") {
			console.error(
				`[yt-transcribe] Audio not found in R2 at key: ${audioR2Key}`
			);
			queueMessage.ack();
			return;
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
