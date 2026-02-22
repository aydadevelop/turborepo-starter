import { ytNlpQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import { ytSignal, ytTranscript } from "@my-app/db/schema/youtube";
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

interface YtNlpDependencies {
	ytClusterQueue?: QueueProducer;
}

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

	const { transcriptId, videoId, organizationId } = parsed.data;

	try {
		// 1. Load transcript text
		const [transcript] = await db
			.select()
			.from(ytTranscript)
			.where(eq(ytTranscript.id, transcriptId))
			.limit(1);

		if (!transcript?.fullText) {
			console.warn(
				`[yt-nlp] Transcript ${transcriptId} not found or empty, skipping`
			);
			queueMessage.ack();
			return;
		}

		// 2. Call LLM to extract feedback signals
		// NOTE: In production, call OpenRouter/OpenAI with a structured prompt
		// that extracts bugs, suggestions, confusion etc. from the transcript.
		console.log(
			`[yt-nlp] Analyzing transcript ${transcriptId} (${transcript.fullText.length} chars)`
		);

		// 3. Placeholder: create sample signal to demonstrate the pipeline
		// Real implementation would parse LLM structured output into signals
		const signalId = crypto.randomUUID();
		await db.insert(ytSignal).values({
			id: signalId,
			transcriptId,
			videoId,
			organizationId,
			type: "other",
			severity: "medium",
			text: "Placeholder signal — replace with LLM extraction",
		});

		// 4. Dispatch signals to cluster queue
		if (dependencies.ytClusterQueue) {
			await dependencies.ytClusterQueue.send(
				{
					kind: "yt.cluster.v1" as const,
					signalId,
					organizationId,
				},
				{ contentType: "json" }
			);
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
