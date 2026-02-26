import type {
	QueueProducer,
	R2BucketLike,
} from "@my-app/api/contracts/youtube-queue";
import type { VectorizeIndex } from "@my-app/api/services/youtube/cluster";
import { createLlmAnalyzer, llmOutputSchema } from "@my-app/api/services/youtube/nlp";
import {
	recoverStuckIngesting,
	recoverTransientFailures,
} from "@my-app/api/services/youtube/recovery";
import {
	DEFAULT_EMBEDDING_MODEL,
	type EmbeddingProvider,
	type VectorizeIndexLike,
} from "@my-app/api/services/youtube/vectorize";
import type { KVStore } from "@my-app/youtube/proxy-client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embedMany, generateText, Output } from "ai";
import { app } from "./app";
import { processRecurringTaskBatch } from "./queues/recurring-task-consumer";
import { processYtClusterBatch } from "./queues/yt-cluster-consumer";
import { processYtDiscoveryBatch } from "./queues/yt-discovery-consumer";
import { processYtIngestBatch } from "./queues/yt-ingest-consumer";
import { processYtNlpBatch } from "./queues/yt-nlp-consumer";
import { processYtTranscribeBatch } from "./queues/yt-transcribe-consumer";
import { processYtVectorizeBatch } from "./queues/yt-vectorize-consumer";

interface Env {
	AI_MODEL?: string;
	NOTIFICATION_QUEUE?: QueueProducer;
	OPEN_ROUTER_API_KEY?: string;
	RECURRING_TASK_QUEUE?: QueueProducer;
	TWO_CAPTCHA_API_KEY?: string;
	YT_CLUSTER_QUEUE?: QueueProducer;
	YT_DISCOVERY_QUEUE?: QueueProducer;
	YT_INGEST_QUEUE?: QueueProducer;
	YT_NLP_QUEUE?: QueueProducer;
	YT_PROXY_CACHE?: KVStore;
	YT_SIGNALS_VECTORIZE?: VectorizeIndexLike & VectorizeIndex;
	YT_TRANSCRIBE_QUEUE?: QueueProducer;
	YT_TRANSCRIPTS_BUCKET?: R2BucketLike;
	YT_VECTORIZE_QUEUE?: QueueProducer;
}

const DEFAULT_NLP_MODEL = "openai/gpt-5-nano:nitro";

function createNlpAnalyzer(env: Env) {
	if (!env.OPEN_ROUTER_API_KEY) {
		return undefined;
	}
	const openrouter = createOpenRouter({ apiKey: env.OPEN_ROUTER_API_KEY });
	const model = openrouter(env.AI_MODEL ?? DEFAULT_NLP_MODEL);
	return createLlmAnalyzer({
		extractSignals: async (prompt) => {
			const { output } = await generateText({
				model,
				output: Output.object({ schema: llmOutputSchema }),
				prompt,
			});
			return output ?? { signals: [] };
		},
	});
}

function createEmbeddingProvider(env: Env): EmbeddingProvider | undefined {
	if (!env.OPEN_ROUTER_API_KEY) {
		return undefined;
	}
	const openrouter = createOpenRouter({ apiKey: env.OPEN_ROUTER_API_KEY });
	const model = openrouter.textEmbeddingModel(DEFAULT_EMBEDDING_MODEL);
	return {
		async generateEmbeddings(texts: string[]): Promise<number[][]> {
			const { embeddings } = await embedMany({ model, values: texts });
			return embeddings;
		},
	};
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
				notificationQueue: env.NOTIFICATION_QUEUE,
			}),
	},
	{
		fragment: "yt-ingest",
		run: (batch, env) =>
			processYtIngestBatch(batch, {
				proxyEnv: {
					twoCaptchaApiKey: env.TWO_CAPTCHA_API_KEY,
					proxyCacheKv: env.YT_PROXY_CACHE,
				},
				ytNlpQueue: env.YT_NLP_QUEUE,
				ytTranscribeQueue: env.YT_TRANSCRIBE_QUEUE,
				ytTranscriptsBucket: env.YT_TRANSCRIPTS_BUCKET,
				notificationQueue: env.NOTIFICATION_QUEUE,
			}),
	},
	{
		fragment: "yt-transcribe",
		run: (batch, env) =>
			processYtTranscribeBatch(batch, {
				ytTranscriptsBucket: env.YT_TRANSCRIPTS_BUCKET,
				ytNlpQueue: env.YT_NLP_QUEUE,
			}),
	},
	{
		fragment: "yt-vectorize",
		run: (batch, env) =>
			processYtVectorizeBatch(batch, {
				vectorizeIndex: env.YT_SIGNALS_VECTORIZE,
				embeddingProvider: createEmbeddingProvider(env),
				ytClusterQueue: env.YT_CLUSTER_QUEUE,
			}),
	},
	{
		fragment: "yt-nlp",
		run: (batch, env) =>
			processYtNlpBatch(batch, {
				analyzeTranscript: createNlpAnalyzer(env),
				ytVectorizeQueue: env.YT_VECTORIZE_QUEUE,
			}),
	},
	{
		fragment: "yt-cluster",
		run: (batch, env) =>
			processYtClusterBatch(batch, {
				vectorizeIndex: env.YT_SIGNALS_VECTORIZE,
				notificationQueue: env.NOTIFICATION_QUEUE,
			}),
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
	scheduled: async (_event, env) => {
		console.log("[server] Scheduled cron: running stuck-ingest recovery");
		if (!env.YT_INGEST_QUEUE) {
			console.warn(
				"[server] Scheduled: YT_INGEST_QUEUE not bound, skipping recovery"
			);
			return;
		}
		try {
			const count = await recoverStuckIngesting({
				ytIngestQueue: env.YT_INGEST_QUEUE,
			});
			console.log(`[server] Scheduled: re-queued ${count} stuck video(s)`);
		} catch (err) {
			console.error("[server] Scheduled: stuck-ingest recovery failed:", err);
		}
		try {
			const { requeued, skipped } = await recoverTransientFailures({
				ytIngestQueue: env.YT_INGEST_QUEUE,
			});
			console.log(
				`[server] Scheduled: transient-failure recovery: ${requeued} re-queued, ${skipped} skipped`
			);
		} catch (err) {
			console.error(
				"[server] Scheduled: transient-failure recovery failed:",
				err
			);
		}
	},
};

export default serverApp;
