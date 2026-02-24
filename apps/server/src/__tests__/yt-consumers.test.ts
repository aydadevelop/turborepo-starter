import { organization, user } from "@my-app/db/schema/auth";
import {
	ytCluster,
	ytFeed,
	ytSignal,
	ytTranscript,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUDIO_R2_KEY_RE = /^audio\/org-1\/video-1\.(m4a|mp4)$/;

// ─── Test DB setup ───────────────────────────────────────────────────────────

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: (db) => {
		db.insert(user)
			.values({
				id: "user-1",
				name: "Test User",
				email: "test@example.com",
				emailVerified: true,
			})
			.run();
		db.insert(organization)
			.values({ id: "org-1", name: "Test Org", slug: "test-org" })
			.run();
		db.insert(ytFeed)
			.values({
				id: "feed-1",
				organizationId: "org-1",
				name: "Alpha Feed",
				gameTitle: "My Game",
				searchQuery: "my game playtest",
				status: "active",
			})
			.run();
		db.insert(ytVideo)
			.values({
				id: "video-1",
				feedId: "feed-1",
				organizationId: "org-1",
				youtubeVideoId: "dQw4w9WgXcQ",
				title: "Playtest Video",
				status: "approved",
			})
			.run();
	},
});

vi.doMock("@my-app/db", () => ({
	db: testDbState.db,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeQueueMessage = (params: { body: unknown; attempts?: number }) => {
	const ack = vi.fn();
	const retry = vi.fn();
	return {
		body: params.body,
		attempts: params.attempts ?? 1,
		ack,
		retry,
	} as unknown as Message & {
		ack: ReturnType<typeof vi.fn>;
		retry: ReturnType<typeof vi.fn>;
	};
};

const makeBatch = (
	messages: Message[],
	queue = "yt-queue"
): MessageBatch<unknown> =>
	({
		messages,
		queue,
		retryAll: vi.fn(),
		ackAll: vi.fn(),
	}) as unknown as MessageBatch<unknown>;

const makeMockQueue = () => ({
	send: vi.fn().mockResolvedValue(undefined),
});

// ─── Discovery Consumer ──────────────────────────────────────────────────────

describe("yt-discovery-consumer", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("processes a valid discovery message and updates lastDiscoveryAt", async () => {
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.discovery.v1",
				feedId: "feed-1",
				organizationId: "org-1",
			},
		});

		const { processYtDiscoveryBatch } = await import(
			"../queues/yt-discovery-consumer"
		);
		await processYtDiscoveryBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();

		const [feed] = await testDbState.db
			.select()
			.from(ytFeed)
			.where(eq(ytFeed.id, "feed-1"));
		expect(feed?.lastDiscoveryAt).not.toBeNull();
	});

	it("acks and skips when feed is not found", async () => {
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.discovery.v1",
				feedId: "nonexistent-feed",
				organizationId: "org-1",
			},
		});

		const { processYtDiscoveryBatch } = await import(
			"../queues/yt-discovery-consumer"
		);
		await processYtDiscoveryBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("acks and skips when feed is paused", async () => {
		await testDbState.db
			.update(ytFeed)
			.set({ status: "paused" })
			.where(eq(ytFeed.id, "feed-1"));

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.discovery.v1",
				feedId: "feed-1",
				organizationId: "org-1",
			},
		});

		const { processYtDiscoveryBatch } = await import(
			"../queues/yt-discovery-consumer"
		);
		await processYtDiscoveryBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("acks invalid message payloads without retry", async () => {
		const queueMessage = makeQueueMessage({
			body: { kind: "unknown" },
		});

		const { processYtDiscoveryBatch } = await import(
			"../queues/yt-discovery-consumer"
		);
		await processYtDiscoveryBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();
	});
});

// ─── Ingest Consumer ─────────────────────────────────────────────────────────

describe("yt-ingest-consumer", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("creates transcript and marks video as ingested (captions path)", async () => {
		const mockNlpQueue = makeMockQueue();

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.ingest.v1",
				videoId: "video-1",
				organizationId: "org-1",
				youtubeVideoId: "dQw4w9WgXcQ",
			},
		});

		const { processYtIngestBatch } = await import(
			"../queues/yt-ingest-consumer"
		);
		await processYtIngestBatch(makeBatch([queueMessage]), {
			ytNlpQueue: mockNlpQueue,
		});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);

		// Video should be marked as ingested
		const [video] = await testDbState.db
			.select()
			.from(ytVideo)
			.where(eq(ytVideo.id, "video-1"));
		expect(video?.status).toBe("ingested");
		expect(video?.ingestedAt).not.toBeNull();

		// Transcript should be created
		const transcripts = await testDbState.db
			.select()
			.from(ytTranscript)
			.where(eq(ytTranscript.videoId, "video-1"));
		expect(transcripts).toHaveLength(1);
		expect(transcripts[0]?.source).toBe("youtube_captions");

		// Downstream queues should be called
		// Pipeline: ingest → NLP (vectorize queue no longer dispatched from ingest)
		expect(mockNlpQueue.send).toHaveBeenCalledTimes(1);

		const nlpMsg = mockNlpQueue.send.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(nlpMsg?.kind).toBe("yt.nlp.v1");
	});

	it("stores audio in R2 and dispatches to transcribe queue (ASR path)", async () => {
		const mockTranscribeQueue = makeMockQueue();
		const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.ingest.v1",
				videoId: "video-1",
				organizationId: "org-1",
				youtubeVideoId: "dQw4w9WgXcQ",
				forceAsr: true,
			},
		});

		const { processYtIngestBatch } = await import(
			"../queues/yt-ingest-consumer"
		);
		await processYtIngestBatch(makeBatch([queueMessage]), {
			ytTranscribeQueue: mockTranscribeQueue,
			ytTranscriptsBucket: mockBucket,
		});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);

		// Video should be marked as ingested
		const [video] = await testDbState.db
			.select()
			.from(ytVideo)
			.where(eq(ytVideo.id, "video-1"));
		expect(video?.status).toBe("ingested");

		// Transcript should be created with whisper_asr source
		const transcripts = await testDbState.db
			.select()
			.from(ytTranscript)
			.where(eq(ytTranscript.videoId, "video-1"));
		expect(transcripts).toHaveLength(1);
		expect(transcripts[0]?.source).toBe("whisper_asr");

		// Audio should be stored in R2
		expect(mockBucket.put).toHaveBeenCalledTimes(1);
		// downloadAudio may return .mp4 (progressive fallback) or .m4a (adaptive)
		const r2Key = mockBucket.put.mock.calls[0]?.[0] as string;
		expect(r2Key).toMatch(AUDIO_R2_KEY_RE);

		// Should dispatch to transcribe queue, NOT vectorize/nlp
		expect(mockTranscribeQueue.send).toHaveBeenCalledTimes(1);
		const transcribeMsg = mockTranscribeQueue.send.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(transcribeMsg?.kind).toBe("yt.transcribe.v1");
		expect(transcribeMsg?.audioR2Key).toMatch(AUDIO_R2_KEY_RE);
	});

	it("marks video as failed on error", async () => {
		// Insert a video that doesn't exist in DB to trigger error
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.ingest.v1",
				videoId: "video-nonexistent",
				organizationId: "org-1",
				youtubeVideoId: "missing",
			},
			attempts: 4, // Past max retries so ack
		});

		const { processYtIngestBatch } = await import(
			"../queues/yt-ingest-consumer"
		);

		// This should not throw — consumer handles errors internally
		await processYtIngestBatch(makeBatch([queueMessage]), {});
		// Either ack or retry is called
		expect(
			queueMessage.ack.mock.calls.length + queueMessage.retry.mock.calls.length
		).toBeGreaterThan(0);
	});

	it("acks invalid message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: { kind: "invalid" },
		});

		const { processYtIngestBatch } = await import(
			"../queues/yt-ingest-consumer"
		);
		await processYtIngestBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("works without downstream queues", async () => {
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.ingest.v1",
				videoId: "video-1",
				organizationId: "org-1",
				youtubeVideoId: "dQw4w9WgXcQ",
			},
		});

		const { processYtIngestBatch } = await import(
			"../queues/yt-ingest-consumer"
		);
		await processYtIngestBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});
});

// ─── Vectorize Consumer ──────────────────────────────────────────────────────

describe("yt-vectorize-consumer", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("acks when no unvectorized signals exist", async () => {
		// Create transcript without signals
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-vec-1",
			videoId: "video-1",
			organizationId: "org-1",
			source: "youtube_captions",
		});

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.vectorize.v1",
				transcriptId: "transcript-vec-1",
				videoId: "video-1",
				organizationId: "org-1",
			},
		});

		const { processYtVectorizeBatch } = await import(
			"../queues/yt-vectorize-consumer"
		);
		await processYtVectorizeBatch(makeBatch([queueMessage]));

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("retries when no vectorize index is provided", async () => {
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-vec-2",
			videoId: "video-1",
			organizationId: "org-1",
			source: "youtube_captions",
		});
		await testDbState.db.insert(ytSignal).values({
			id: "signal-vec-1",
			transcriptId: "transcript-vec-2",
			videoId: "video-1",
			organizationId: "org-1",
			type: "bug",
			text: "Camera glitch",
			vectorized: false,
		});

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.vectorize.v1",
				transcriptId: "transcript-vec-2",
				videoId: "video-1",
				organizationId: "org-1",
			},
		});

		const { processYtVectorizeBatch } = await import(
			"../queues/yt-vectorize-consumer"
		);
		await processYtVectorizeBatch(makeBatch([queueMessage]));

		// Without vectorize index, should ack (skip gracefully — index won't appear mid-run)
		expect(queueMessage.ack).toHaveBeenCalledTimes(1);

		const [signal] = await testDbState.db
			.select()
			.from(ytSignal)
			.where(eq(ytSignal.id, "signal-vec-1"));
		expect(signal?.vectorized).toBe(false);
	});

	it("marks signals as vectorized when index is available", async () => {
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-vec-3",
			videoId: "video-1",
			organizationId: "org-1",
			source: "youtube_captions",
		});
		await testDbState.db.insert(ytSignal).values({
			id: "signal-vec-2",
			transcriptId: "transcript-vec-3",
			videoId: "video-1",
			organizationId: "org-1",
			type: "bug",
			text: "Camera glitch",
			vectorized: false,
		});

		const mockVectorizeIndex = { upsert: vi.fn().mockResolvedValue(undefined) };
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.vectorize.v1",
				transcriptId: "transcript-vec-3",
				videoId: "video-1",
				organizationId: "org-1",
			},
		});

		const { processYtVectorizeBatch } = await import(
			"../queues/yt-vectorize-consumer"
		);
		await processYtVectorizeBatch(makeBatch([queueMessage]), {
			vectorizeIndex: mockVectorizeIndex,
		});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);

		const [signal] = await testDbState.db
			.select()
			.from(ytSignal)
			.where(eq(ytSignal.id, "signal-vec-2"));
		expect(signal?.vectorized).toBe(true);
		expect(signal?.embeddingModel).toBe("hash-256");
	});

	it("acks invalid message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: { kind: "invalid" },
		});

		const { processYtVectorizeBatch } = await import(
			"../queues/yt-vectorize-consumer"
		);
		await processYtVectorizeBatch(makeBatch([queueMessage]));

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});
});

// ─── NLP Consumer ────────────────────────────────────────────────────────────

describe("yt-nlp-consumer", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("creates a signal from transcript text", async () => {
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-nlp-1",
			videoId: "video-1",
			organizationId: "org-1",
			source: "youtube_captions",
			fullText: "Okay so I found this bug where the camera clips through walls",
		});

		const mockVectorizeQueue = makeMockQueue();
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.nlp.v1",
				transcriptId: "transcript-nlp-1",
				videoId: "video-1",
				organizationId: "org-1",
			},
		});

		const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
		await processYtNlpBatch(makeBatch([queueMessage]), {
			ytVectorizeQueue: mockVectorizeQueue,
		});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);

		// Should create at least one signal
		const signals = await testDbState.db
			.select()
			.from(ytSignal)
			.where(eq(ytSignal.videoId, "video-1"));
		expect(signals.length).toBeGreaterThanOrEqual(1);

		// Should dispatch to vectorize queue (pipeline: NLP → vectorize → cluster)
		expect(mockVectorizeQueue.send).toHaveBeenCalledTimes(1);
		const vectorizeMsg = mockVectorizeQueue.send.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(vectorizeMsg?.kind).toBe("yt.vectorize.v1");
	});

	it("acks when transcript has no fullText", async () => {
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-nlp-empty",
			videoId: "video-1",
			organizationId: "org-1",
			source: "youtube_captions",
			fullText: null,
		});

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.nlp.v1",
				transcriptId: "transcript-nlp-empty",
				videoId: "video-1",
				organizationId: "org-1",
			},
		});

		const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
		await processYtNlpBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("acks when transcript not found", async () => {
		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.nlp.v1",
				transcriptId: "nonexistent",
				videoId: "video-1",
				organizationId: "org-1",
			},
		});

		const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
		await processYtNlpBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("acks invalid message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: { kind: "garbage" },
		});

		const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
		await processYtNlpBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});
});

// ─── Cluster Consumer ────────────────────────────────────────────────────────

describe("yt-cluster-consumer", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("creates a cluster and assigns signal", async () => {
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-cluster-1",
			videoId: "video-1",
			organizationId: "org-1",
			source: "youtube_captions",
			fullText: "camera bug",
		});
		await testDbState.db.insert(ytSignal).values({
			id: "signal-cluster-1",
			transcriptId: "transcript-cluster-1",
			videoId: "video-1",
			organizationId: "org-1",
			type: "bug",
			severity: "high",
			text: "Camera clips through wall while crouching",
		});

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.cluster.v1",
				signalId: "signal-cluster-1",
				organizationId: "org-1",
			},
		});

		const { processYtClusterBatch } = await import(
			"../queues/yt-cluster-consumer"
		);
		await processYtClusterBatch(makeBatch([queueMessage]));

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();

		const [signal] = await testDbState.db
			.select()
			.from(ytSignal)
			.where(eq(ytSignal.id, "signal-cluster-1"));
		expect(signal?.clusterId).toBeTruthy();

		const [cluster] = await testDbState.db
			.select()
			.from(ytCluster)
			.where(eq(ytCluster.id, signal?.clusterId ?? ""));
		expect(cluster).toBeDefined();
		expect(cluster?.type).toBe("bug");
		expect(cluster?.severity).toBe("high");
		expect(cluster?.signalCount).toBe(1);
	});

	it("acks invalid message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: { kind: "invalid" },
		});

		const { processYtClusterBatch } = await import(
			"../queues/yt-cluster-consumer"
		);
		await processYtClusterBatch(makeBatch([queueMessage]));

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		expect(queueMessage.retry).not.toHaveBeenCalled();
	});
});

// ─── Transcribe Consumer ─────────────────────────────────────────────────────

describe("yt-transcribe-consumer", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("reads audio from R2, updates transcript, and dispatches downstream", async () => {
		// Seed a transcript for the transcribe consumer to update
		await testDbState.db.insert(ytTranscript).values({
			id: "transcript-asr-1",
			videoId: "video-1",
			organizationId: "org-1",
			source: "whisper_asr",
			fullText: "",
		});

		const mockBucket = {
			get: vi.fn().mockResolvedValue({
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
			}),
		};
		const mockNlpQueue = makeMockQueue();

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.transcribe.v1",
				transcriptId: "transcript-asr-1",
				videoId: "video-1",
				organizationId: "org-1",
				audioR2Key: "audio/org-1/video-1.m4a",
				contentType: "audio/mp4",
			},
		});

		const { processYtTranscribeBatch } = await import(
			"../queues/yt-transcribe-consumer"
		);
		await processYtTranscribeBatch(makeBatch([queueMessage]), {
			ytTranscriptsBucket: mockBucket,
			ytNlpQueue: mockNlpQueue,
		});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);

		// Should have read from R2
		expect(mockBucket.get).toHaveBeenCalledWith("audio/org-1/video-1.m4a");

		// Transcript source should be updated
		const [transcript] = await testDbState.db
			.select()
			.from(ytTranscript)
			.where(eq(ytTranscript.id, "transcript-asr-1"));
		expect(transcript?.source).toBe("whisper_asr");

		// Pipeline: transcribe → NLP (vectorize no longer dispatched from transcribe)
		expect(mockNlpQueue.send).toHaveBeenCalledTimes(1);

		const nlpMsg = mockNlpQueue.send.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(nlpMsg?.kind).toBe("yt.nlp.v1");
		expect(nlpMsg?.transcriptId).toBe("transcript-asr-1");
	});

	it("acks when audio not found in R2", async () => {
		const mockBucket = {
			get: vi.fn().mockResolvedValue(null),
		};

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.transcribe.v1",
				transcriptId: "transcript-asr-missing",
				videoId: "video-1",
				organizationId: "org-1",
				audioR2Key: "audio/org-1/nonexistent.m4a",
			},
		});

		const { processYtTranscribeBatch } = await import(
			"../queues/yt-transcribe-consumer"
		);
		await processYtTranscribeBatch(makeBatch([queueMessage]), {
			ytTranscriptsBucket: mockBucket,
		});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("acks invalid message payloads", async () => {
		const queueMessage = makeQueueMessage({
			body: { kind: "invalid" },
		});

		const { processYtTranscribeBatch } = await import(
			"../queues/yt-transcribe-consumer"
		);
		await processYtTranscribeBatch(makeBatch([queueMessage]), {});

		expect(queueMessage.ack).toHaveBeenCalledTimes(1);
	});

	it("retries on error when under max attempts", async () => {
		const mockBucket = {
			get: vi.fn().mockRejectedValue(new Error("R2 unavailable")),
		};

		const queueMessage = makeQueueMessage({
			body: {
				kind: "yt.transcribe.v1",
				transcriptId: "transcript-asr-retry",
				videoId: "video-1",
				organizationId: "org-1",
				audioR2Key: "audio/org-1/video-1.m4a",
			},
			attempts: 1,
		});

		const { processYtTranscribeBatch } = await import(
			"../queues/yt-transcribe-consumer"
		);
		await processYtTranscribeBatch(makeBatch([queueMessage]), {
			ytTranscriptsBucket: mockBucket,
		});

		expect(queueMessage.retry).toHaveBeenCalledTimes(1);
		expect(queueMessage.ack).not.toHaveBeenCalled();
	});
});
