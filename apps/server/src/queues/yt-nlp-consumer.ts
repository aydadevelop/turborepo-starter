import { ytNlpQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import {
	processYtNlpMessage,
	type YtNlpDependencies,
} from "@my-app/api/services/youtube/nlp";

const MAX_RETRY_ATTEMPTS = 3;

const handleNlpMessage = async (
	queueMessage: Message,
	dependencies: YtNlpDependencies
) => {
	const parsed = ytNlpQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-nlp] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { transcriptId } = parsed.data;

	try {
		const result = await processYtNlpMessage({
			message: parsed.data,
			dependencies,
		});

		if (result === "skipped_missing_or_empty_transcript") {
			console.warn(
				`[yt-nlp] Transcript ${transcriptId} not found or empty, skipping`
			);
			queueMessage.ack();
			return;
		}

		if (result === "skipped_short_transcript") {
			console.log(`[yt-nlp] Transcript ${transcriptId} too short, skipping`);
			queueMessage.ack();
			return;
		}

		queueMessage.ack();
	} catch (error) {
		console.error(
			`[yt-nlp] Failed to analyze transcript ${transcriptId}:`,
			error
		);

		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 60, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtNlpBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtNlpDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleNlpMessage(queueMessage, dependencies);
	}
};
