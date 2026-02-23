import { app } from "./app";
import { processRecurringTaskBatch } from "./queues/recurring-task-consumer";
import { processYtClusterBatch } from "./queues/yt-cluster-consumer";
import { processYtDiscoveryBatch } from "./queues/yt-discovery-consumer";
import { processYtIngestBatch } from "./queues/yt-ingest-consumer";
import { processYtNlpBatch } from "./queues/yt-nlp-consumer";
import { processYtTranscribeBatch } from "./queues/yt-transcribe-consumer";
import { processYtVectorizeBatch } from "./queues/yt-vectorize-consumer";

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
	put(key: string, value: ArrayBuffer | string): Promise<unknown>;
}

interface VectorizeIndexLike {
	upsert(
		vectors: Array<{
			id: string;
			values: number[];
			metadata?: Record<string, string | number | boolean>;
		}>
	): Promise<unknown>;
}

interface Env {
	NOTIFICATION_QUEUE?: QueueProducer;
	RECURRING_TASK_QUEUE?: QueueProducer;
	YT_DISCOVERY_QUEUE?: QueueProducer;
	YT_INGEST_QUEUE?: QueueProducer;
	YT_CLUSTER_QUEUE?: QueueProducer;
	YT_NLP_QUEUE?: QueueProducer;
	YT_SIGNALS_VECTORIZE?: VectorizeIndexLike;
	YT_TRANSCRIBE_QUEUE?: QueueProducer;
	YT_TRANSCRIPTS_BUCKET?: R2BucketLike;
	YT_VECTORIZE_QUEUE?: QueueProducer;
}

const getQueueName = (batch: MessageBatch<unknown>): string => {
	return batch.queue;
};

interface QueueProcessor {
	fragment: string;
	run(batch: MessageBatch<unknown>, env: Env): Promise<void>;
}

const queueProcessors: QueueProcessor[] = [
	{
		fragment: "yt-discovery",
		run: (batch, env) =>
			processYtDiscoveryBatch(batch, {
				ytIngestQueue: env.YT_INGEST_QUEUE,
			}),
	},
	{
		fragment: "yt-ingest",
		run: (batch, env) =>
			processYtIngestBatch(batch, {
				ytVectorizeQueue: env.YT_VECTORIZE_QUEUE,
				ytNlpQueue: env.YT_NLP_QUEUE,
				ytTranscribeQueue: env.YT_TRANSCRIBE_QUEUE,
				ytTranscriptsBucket: env.YT_TRANSCRIPTS_BUCKET,
			}),
	},
	{
		fragment: "yt-transcribe",
		run: (batch, env) =>
			processYtTranscribeBatch(batch, {
				ytTranscriptsBucket: env.YT_TRANSCRIPTS_BUCKET,
				ytVectorizeQueue: env.YT_VECTORIZE_QUEUE,
				ytNlpQueue: env.YT_NLP_QUEUE,
			}),
	},
	{
		fragment: "yt-vectorize",
		run: (batch, env) =>
			processYtVectorizeBatch(batch, env.YT_SIGNALS_VECTORIZE),
	},
	{
		fragment: "yt-nlp",
		run: (batch, env) =>
			processYtNlpBatch(batch, {
				ytClusterQueue: env.YT_CLUSTER_QUEUE,
			}),
	},
	{
		fragment: "yt-cluster",
		run: (batch) => processYtClusterBatch(batch),
	},
];

const serverApp: ExportedHandler<Env> = {
	fetch: app.fetch,
	queue: async (batch, env) => {
		const queueName = getQueueName(batch);

		const matchedProcessor = queueProcessors.find(({ fragment }) =>
			queueName.includes(fragment)
		);
		if (matchedProcessor) {
			await matchedProcessor.run(batch, env);
			return;
		}

		// Default: recurring task queue
		await processRecurringTaskBatch(batch, {
			notificationQueue: env.NOTIFICATION_QUEUE,
			recurringTaskQueue: env.RECURRING_TASK_QUEUE,
		});
	},
};

export default serverApp;
