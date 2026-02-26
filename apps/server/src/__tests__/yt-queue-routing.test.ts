import { beforeEach, describe, expect, it, vi } from "vitest";

const processYtDiscoveryBatchMock = vi.fn().mockResolvedValue(undefined);
const processYtIngestBatchMock = vi.fn().mockResolvedValue(undefined);
const processYtVectorizeBatchMock = vi.fn().mockResolvedValue(undefined);
const processYtNlpBatchMock = vi.fn().mockResolvedValue(undefined);
const processYtClusterBatchMock = vi.fn().mockResolvedValue(undefined);
const processYtTranscribeBatchMock = vi.fn().mockResolvedValue(undefined);
const processRecurringTaskBatchMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../queues/yt-discovery-consumer", () => ({
	processYtDiscoveryBatch: processYtDiscoveryBatchMock,
}));
vi.mock("../queues/yt-ingest-consumer", () => ({
	processYtIngestBatch: processYtIngestBatchMock,
}));
vi.mock("../queues/yt-vectorize-consumer", () => ({
	processYtVectorizeBatch: processYtVectorizeBatchMock,
}));
vi.mock("../queues/yt-nlp-consumer", () => ({
	processYtNlpBatch: processYtNlpBatchMock,
}));
vi.mock("../queues/yt-cluster-consumer", () => ({
	processYtClusterBatch: processYtClusterBatchMock,
}));
vi.mock("../queues/yt-transcribe-consumer", () => ({
	processYtTranscribeBatch: processYtTranscribeBatchMock,
}));
vi.mock("../queues/recurring-task-consumer", () => ({
	processRecurringTaskBatch: processRecurringTaskBatchMock,
}));

vi.mock("../app", () => ({
	app: { fetch: vi.fn() },
}));

function makeBatch(queueName: string): MessageBatch<unknown> {
	return {
		queue: queueName,
		messages: [],
		ackAll: vi.fn(),
		retryAll: vi.fn(),
	} as unknown as MessageBatch<unknown>;
}

describe("queue routing (index.ts)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function getQueueHandler() {
		const serverApp = (await import("../index")).default;
		const handler = serverApp.queue;
		if (!handler) {
			throw new Error("queue handler missing");
		}
		return handler;
	}

	const env = {
		YT_INGEST_QUEUE: { send: vi.fn() },
		YT_VECTORIZE_QUEUE: { send: vi.fn() },
		YT_NLP_QUEUE: { send: vi.fn() },
		YT_CLUSTER_QUEUE: { send: vi.fn() },
		YT_TRANSCRIBE_QUEUE: { send: vi.fn() },
		YT_SIGNALS_VECTORIZE: {
			upsert: vi.fn(),
			query: vi.fn().mockResolvedValue({ matches: [] }),
			getByIds: vi.fn().mockResolvedValue([]),
		},
		YT_TRANSCRIPTS_BUCKET: { get: vi.fn(), put: vi.fn() },
		NOTIFICATION_QUEUE: { send: vi.fn() },
		RECURRING_TASK_QUEUE: { send: vi.fn() },
	};

	it("routes yt-discovery queue to discovery consumer", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-yt-discovery-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processYtDiscoveryBatchMock).toHaveBeenCalledWith(batch, {
			ytIngestQueue: env.YT_INGEST_QUEUE,
		});
		expect(processYtIngestBatchMock).not.toHaveBeenCalled();
	});

	it("routes yt-ingest queue to ingest consumer", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-yt-ingest-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processYtIngestBatchMock).toHaveBeenCalledWith(batch, {
			ytVectorizeQueue: env.YT_VECTORIZE_QUEUE,
			ytNlpQueue: env.YT_NLP_QUEUE,
			ytTranscribeQueue: env.YT_TRANSCRIBE_QUEUE,
			ytTranscriptsBucket: env.YT_TRANSCRIPTS_BUCKET,
		});
		expect(processYtDiscoveryBatchMock).not.toHaveBeenCalled();
	});

	it("routes yt-transcribe queue to transcribe consumer", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-yt-transcribe-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processYtTranscribeBatchMock).toHaveBeenCalledWith(batch, {
			ytTranscriptsBucket: env.YT_TRANSCRIPTS_BUCKET,
			ytVectorizeQueue: env.YT_VECTORIZE_QUEUE,
			ytNlpQueue: env.YT_NLP_QUEUE,
		});
		expect(processYtIngestBatchMock).not.toHaveBeenCalled();
	});

	it("routes yt-vectorize queue to vectorize consumer", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-yt-vectorize-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processYtVectorizeBatchMock).toHaveBeenCalledWith(
			batch,
			env.YT_SIGNALS_VECTORIZE
		);
	});

	it("routes yt-nlp queue to NLP consumer", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-yt-nlp-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processYtNlpBatchMock).toHaveBeenCalledWith(batch, {
			ytClusterQueue: env.YT_CLUSTER_QUEUE,
		});
	});

	it("routes yt-cluster queue to cluster consumer", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-yt-cluster-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processYtClusterBatchMock).toHaveBeenCalledWith(batch);
	});

	it("falls back to recurring task consumer for unknown queues", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("my-app-recurring-task-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processRecurringTaskBatchMock).toHaveBeenCalledWith(batch, {
			notificationQueue: env.NOTIFICATION_QUEUE,
			recurringTaskQueue: env.RECURRING_TASK_QUEUE,
		});
	});

	it("falls back to recurring task for completely unknown queue name", async () => {
		const handler = await getQueueHandler();
		const batch = makeBatch("totally-random-queue");

		await handler(batch, env, {} as ExecutionContext);

		expect(processRecurringTaskBatchMock).toHaveBeenCalled();
		expect(processYtDiscoveryBatchMock).not.toHaveBeenCalled();
		expect(processYtIngestBatchMock).not.toHaveBeenCalled();
		expect(processYtVectorizeBatchMock).not.toHaveBeenCalled();
		expect(processYtNlpBatchMock).not.toHaveBeenCalled();
		expect(processYtClusterBatchMock).not.toHaveBeenCalled();
	});
});
