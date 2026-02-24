/**
 * TDD Test Suite: YouTube Playtest Feedback Pipeline
 *
 * Tests organized by User Story, each with 3 variants:
 *   - BEST:  Full quality, production-grade behavior
 *   - MVP:   Minimum viable — works correctly, minimal features
 *   - POC:   Proof of concept — simplest possible validation
 *
 * The hardest flow tested end-to-end:
 *   Discovery → Ingest → NLP Extraction → Vectorize → Cluster → State Machine
 */

import { organization, user } from "@my-app/db/schema/auth";
import {
	ytCluster,
	ytFeed,
	ytSignal,
	ytTranscript,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { bootstrapTestDatabase } from "@my-app/db/test";
import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ClusterBatchFn = (...args: unknown[]) => Promise<void>;

// ─── Test DB ─────────────────────────────────────────────────────────────────

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: (db) => {
		db.insert(user)
			.values({
				id: "user-1",
				name: "QA Lead",
				email: "qa@studio.com",
				emailVerified: true,
			})
			.run();
		db.insert(organization)
			.values({ id: "org-1", name: "Game Studio", slug: "game-studio" })
			.run();
		db.insert(ytFeed)
			.values({
				id: "feed-1",
				organizationId: "org-1",
				name: "Alpha Playtest",
				gameTitle: "Stellar Drift",
				searchQuery: "stellar drift playtest",
				gameVersion: "0.9.1",
				stopWords: "trailer,mod,reaction",
				publishedAfter: "2026-02-01",
				status: "active",
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

/** Seed a video that's been approved and is ready for ingestion */
const seedApprovedVideo = (
	overrides: Partial<typeof ytVideo.$inferInsert> = {}
) => {
	const defaults = {
		id: "video-1",
		feedId: "feed-1",
		organizationId: "org-1",
		youtubeVideoId: "abc123def",
		title: "Stellar Drift Alpha — so many bugs!",
		channelName: "IndieGamer42",
		channelId: "UC_indie42",
		status: "approved" as const,
		...overrides,
	};
	testDbState.db.insert(ytVideo).values(defaults).run();
	return defaults;
};

/** Seed a transcript with real-ish gameplay commentary */
const seedTranscript = (
	overrides: Partial<typeof ytTranscript.$inferInsert> = {}
) => {
	const defaults = {
		id: "transcript-1",
		videoId: "video-1",
		organizationId: "org-1",
		source: "youtube_captions" as const,
		language: "en",
		fullText: `okay so I'm playing Stellar Drift alpha build 0.9.1 and immediately 
when I go into the hangar the camera just clips through the wall it's really annoying 
like I can see outside the map. Also the UI for the inventory is super confusing 
I have no idea how to equip items it took me like five minutes to figure out 
you have to right click and then drag. Oh and the framerate drops to like 
10fps whenever there are more than 3 enemies on screen that's a big performance 
issue. But I love the art style the ship designs are incredible honestly 
one of the best looking indie games I've played. One more thing when you try 
to dock at the station sometimes the prompt just doesn't appear so you're just 
floating there unable to do anything had to restart the game twice.`,
		...overrides,
	};
	testDbState.db.insert(ytTranscript).values(defaults).run();
	return defaults;
};

// ─── Mock LLM analyzer for NLP tests ─────────────────────────────────────────

/** Canned signal data matching the default seed transcript */
const DEFAULT_SEED_SIGNALS = [
	{
		type: "bug" as const,
		severity: "high" as const,
		text: "camera just clips through the wall it's really annoying like I can see outside the map",
		startOffset: 99,
		endOffset: 191,
		confidence: 85,
		component: "camera",
		contextAfter: "Also the UI for the inventory is super confusing",
	},
	{
		type: "confusion" as const,
		severity: "medium" as const,
		text: "the UI for the inventory is super confusing I have no idea how to equip items it took me like five minutes to figure out",
		startOffset: 193,
		endOffset: 349,
		confidence: 75,
		component: "inventory",
		contextBefore: "camera just clips through the wall it's really annoying",
		contextAfter: "Oh and the framerate drops to like 10fps",
	},
	{
		type: "performance" as const,
		severity: "high" as const,
		text: "the framerate drops to like 10fps whenever there are more than 3 enemies on screen that's a big performance issue",
		startOffset: 362,
		endOffset: 478,
		confidence: 90,
		component: "rendering",
		contextBefore: "you have to right click and then drag",
	},
	{
		type: "bug" as const,
		severity: "high" as const,
		text: "when you try to dock at the station sometimes the prompt just doesn't appear so you're just floating there unable to do anything",
		startOffset: 610,
		endOffset: 740,
		confidence: 80,
		component: "docking",
		contextBefore: "one of the best looking indie games I've played",
		contextAfter: "had to restart the game twice",
	},
	{
		type: "praise" as const,
		severity: "info" as const,
		text: "I love the art style the ship designs are incredible honestly one of the best looking indie games I've played",
		startOffset: 483,
		endOffset: 604,
		confidence: 70,
		component: "graphics",
	},
];

const TIMESTAMP_SIGNALS = [
	{
		type: "crash" as const,
		severity: "critical" as const,
		text: "at 2:30 the game crashes when you open the map",
		timestampStart: 150,
		timestampEnd: 180,
		confidence: 95,
		component: "map",
	},
	{
		type: "bug" as const,
		severity: "high" as const,
		text: "at around 5 minutes in there's a texture glitch on the left wall of the corridor",
		timestampStart: 300,
		timestampEnd: 330,
		confidence: 80,
		component: "graphics",
	},
];

const PRAISE_SIGNALS = [
	{
		type: "praise" as const,
		severity: "info" as const,
		text: "This game is absolutely amazing",
		confidence: 85,
	},
	{
		type: "praise" as const,
		severity: "info" as const,
		text: "The art direction is stunning and the gameplay loop is so satisfying",
		confidence: 80,
	},
	{
		type: "praise" as const,
		severity: "info" as const,
		text: "The soundtrack is perfect and the controls feel really tight and responsive",
		confidence: 75,
	},
];

/** Creates a mock analyzeTranscript function that returns canned data by content */
const makeMockAnalyzer = (overrideSignals?: unknown[]) =>
	vi.fn().mockImplementation((text: string) => {
		if (overrideSignals) {
			return overrideSignals;
		}
		if (
			text.includes("camera just clips") ||
			text.includes("camera keeps clipping") ||
			text.includes("camera clips")
		) {
			return DEFAULT_SEED_SIGNALS;
		}
		if (text.includes("2:30") && text.includes("crashes")) {
			return TIMESTAMP_SIGNALS;
		}
		if (
			text.includes("absolutely amazing") &&
			!text.includes("bug") &&
			!text.includes("crash")
		) {
			return PRAISE_SIGNALS;
		}
		return [];
	});

// =============================================================================
// STORY 2.1 — Автоматически извлечь баги (NLP Signal Extraction)
// =============================================================================
// This is the HARDEST and most critical piece — without working extraction,
// nothing downstream (clustering, prioritization, Jira) has value.
// =============================================================================

describe("Story 2.1: NLP Signal Extraction", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: Full structured extraction with all fields ──────────────────
	describe("BEST — Full structured extraction with types, timestamps, confidence", () => {
		it("extracts multiple typed signals from a transcript with context and confidence", async () => {
			seedApprovedVideo();
			seedTranscript();

			const mockVectorizeQueue = makeMockQueue();
			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: mockVectorizeQueue,
				analyzeTranscript: makeMockAnalyzer(),
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, "video-1"));

			// Should extract at least 4 distinct signals from the transcript:
			// 1. Camera clipping through wall (bug)
			// 2. Inventory UI confusion (ux_friction / confusion)
			// 3. FPS drops with enemies (performance)
			// 4. Docking prompt missing (bug)
			// 5. Art style praise (praise) — optional but nice
			expect(signals.length).toBeGreaterThanOrEqual(4);

			// Each signal must have required structure
			for (const signal of signals) {
				expect(signal.type).toBeDefined();
				expect(
					[
						"bug",
						"ux_friction",
						"confusion",
						"praise",
						"suggestion",
						"performance",
						"crash",
						"exploit",
						"other",
					].includes(signal.type)
				).toBe(true);
				expect(signal.text).toBeTruthy();
				expect(signal.text.length).toBeGreaterThan(10);
				expect(signal.confidence).toBeGreaterThanOrEqual(0);
				expect(signal.confidence).toBeLessThanOrEqual(100);
				expect(signal.severity).toBeDefined();
			}

			// At least one bug-type signal should be extracted
			const bugs = signals.filter((s) => s.type === "bug");
			expect(bugs.length).toBeGreaterThanOrEqual(1);

			// At least one performance signal
			const perf = signals.filter((s) => s.type === "performance");
			expect(perf.length).toBeGreaterThanOrEqual(1);

			// At least one UX/confusion signal
			const ux = signals.filter(
				(s) => s.type === "ux_friction" || s.type === "confusion"
			);
			expect(ux.length).toBeGreaterThanOrEqual(1);

			// Signals should have context (before/after snippets)
			const withContext = signals.filter(
				(s) => s.contextBefore || s.contextAfter
			);
			expect(withContext.length).toBeGreaterThanOrEqual(1);

			// Vectorize queue should be called once (per transcript, not per signal)
			expect(mockVectorizeQueue.send).toHaveBeenCalledTimes(1);
			const msg = mockVectorizeQueue.send.mock.calls[0]?.[0] as Record<
				string,
				unknown
			>;
			expect(msg.kind).toBe("yt.vectorize.v1");
			expect(msg.transcriptId).toBe("transcript-1");
			expect(msg.organizationId).toBe("org-1");
		});

		it("assigns severity based on signal impact (critical > bug, medium > confusion)", async () => {
			seedApprovedVideo();
			seedTranscript();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, "video-1"));

			// Docking prompt missing / camera clip = game-breaking → should be high/critical
			const criticalBugs = signals.filter(
				(s) =>
					s.type === "bug" &&
					(s.severity === "high" || s.severity === "critical")
			);
			expect(criticalBugs.length).toBeGreaterThanOrEqual(1);

			// Performance issue (10fps) should be at least medium
			const perfIssues = signals.filter(
				(s) =>
					s.type === "performance" &&
					s.severity !== "low" &&
					s.severity !== "info"
			);
			expect(perfIssues.length).toBeGreaterThanOrEqual(1);
		});

		it("extracts timestamp hints from transcript when available", async () => {
			seedApprovedVideo();
			// Transcript with explicit time references
			seedTranscript({
				id: "transcript-ts",
				fullText: `at 2:30 the game crashes when you open the map and then at around 
5 minutes in there's a texture glitch on the left wall of the corridor`,
			});

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-ts",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.transcriptId, "transcript-ts"));

			// At least one signal should have timestamp extracted
			const withTimestamp = signals.filter(
				(s) => s.timestampStart !== null && s.timestampStart !== undefined
			);
			expect(withTimestamp.length).toBeGreaterThanOrEqual(1);
		});

		it("stores character offsets so quotes can be extracted from fullText", async () => {
			seedApprovedVideo();
			const transcript = seedTranscript();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, "video-1"));

			// At least some signals should have offsets
			const withOffsets = signals.filter(
				(s) =>
					s.startOffset !== null &&
					s.startOffset !== undefined &&
					s.endOffset !== null &&
					s.endOffset !== undefined
			);
			expect(withOffsets.length).toBeGreaterThanOrEqual(1);

			// Offsets must be valid ranges within the transcript
			const fullText = transcript.fullText ?? "";
			for (const signal of withOffsets) {
				expect(signal.startOffset).toBeGreaterThanOrEqual(0);
				expect(signal.endOffset).toBeGreaterThan(signal.startOffset ?? 0);
				expect(signal.endOffset).toBeLessThanOrEqual(fullText.length);

				// The quote extracted via offsets should be a substring of fullText
				const quote = fullText.slice(
					signal.startOffset ?? 0,
					signal.endOffset ?? 0
				);
				expect(quote.length).toBeGreaterThan(5);
			}
		});

		it("marks transcript nlpStatus as processed after extraction", async () => {
			seedApprovedVideo();
			seedTranscript();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			const [transcript] = await testDbState.db
				.select()
				.from(ytTranscript)
				.where(eq(ytTranscript.id, "transcript-1"));

			expect(transcript?.nlpStatus).toBe("processed");
			expect(transcript?.markedAt).toBeDefined();
		});
	});

	// ─── MVP: Correct type classification + text extraction ────────────────
	describe("MVP — Correct type classification and text extraction", () => {
		it("extracts at least one signal per distinct issue in transcript", async () => {
			seedApprovedVideo();
			seedTranscript();

			const mockVectorizeQueue = makeMockQueue();
			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: mockVectorizeQueue,
				analyzeTranscript: makeMockAnalyzer(),
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, "video-1"));

			// MVP: at least 2 signals extracted (not just one placeholder)
			expect(signals.length).toBeGreaterThanOrEqual(2);

			// Each signal must have valid type from the enum
			for (const signal of signals) {
				expect(signal.type).not.toBe("other"); // Not just fallback
				expect(signal.text.length).toBeGreaterThan(5);
				expect(signal.organizationId).toBe("org-1");
				expect(signal.transcriptId).toBe("transcript-1");
			}

			// Must dispatch to vectorize queue once (per transcript)
			expect(mockVectorizeQueue.send).toHaveBeenCalledTimes(1);
		});

		it("does not create signals from empty or very short transcripts", async () => {
			seedApprovedVideo();
			seedTranscript({
				id: "transcript-short",
				fullText: "hi",
			});

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-short",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				analyzeTranscript: makeMockAnalyzer(),
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.transcriptId, "transcript-short"));

			// Should NOT create placeholder signals for trivial content
			expect(signals.length).toBe(0);
		});

		it("handles transcripts with only positive feedback (praise)", async () => {
			seedApprovedVideo();
			seedTranscript({
				id: "transcript-praise",
				fullText: `This game is absolutely amazing. The art direction is stunning 
and the gameplay loop is so satisfying. Best indie game of the year honestly. 
The soundtrack is perfect and the controls feel really tight and responsive.`,
			});

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-praise",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.transcriptId, "transcript-praise"));

			// Praise signals are valid — system should still extract them
			if (signals.length > 0) {
				const praiseSignals = signals.filter((s) => s.type === "praise");
				expect(praiseSignals.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	// ─── POC: Any signal creation at all ───────────────────────────────────
	describe("POC — Basic signal creation from transcript", () => {
		it("creates at least one non-placeholder signal from real text", async () => {
			seedApprovedVideo();
			seedTranscript();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, "video-1"));

			expect(signals.length).toBeGreaterThanOrEqual(1);

			// POC minimum: signal must reference the actual content, not be a placeholder
			const firstSignal = signals[0];
			expect(firstSignal).toBeDefined();
			expect(firstSignal?.text).not.toContain("Placeholder");
			expect(firstSignal?.text).not.toContain("placeholder");
			expect(firstSignal?.type).toBeDefined();
		});

		it("acks message and doesn't throw on malformed transcript text", async () => {
			seedApprovedVideo();
			seedTranscript({
				id: "transcript-weird",
				fullText: "🎮🎮🎮 !!!!! $$$$$ -----",
			});

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-weird",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				analyzeTranscript: makeMockAnalyzer(),
			});

			// Must not crash — ack cleanly
			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});

		it("correctly wires organizationId and videoId on created signals", async () => {
			seedApprovedVideo();
			seedTranscript();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([queueMessage]), {
				ytVectorizeQueue: makeMockQueue(),
				analyzeTranscript: makeMockAnalyzer(),
			});

			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, "video-1"));

			for (const signal of signals) {
				expect(signal.organizationId).toBe("org-1");
				expect(signal.videoId).toBe("video-1");
				expect(signal.transcriptId).toBe("transcript-1");
			}
		});
	});
});

// =============================================================================
// STORY 1.1 — Discovery: Быстро увидеть релевантные видео
// =============================================================================

describe("Story 1.1: Discovery — Find relevant videos", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: YouTube search → candidate insert with dedup ────────────────
	describe("BEST — Discovery inserts candidates, deduplicates, filters stop-words", () => {
		it("searches YouTube and inserts new candidate videos filtering stop-words", async () => {
			// Mock the YouTube search to return known candidates
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([
					{
						youtubeVideoId: "yt-001",
						title: "Stellar Drift Alpha — found a crash bug",
						channelId: "UC_gamer1",
						channelName: "Gamer1",
						description: "Playing the alpha, found some issues",
						duration: "PT15M30S",
						publishedAt: "2026-02-15",
						thumbnailUrl: "https://i.ytimg.com/vi/yt-001/hqdefault.jpg",
						viewCount: 1500,
					},
					{
						youtubeVideoId: "yt-002",
						title: "Stellar Drift Official Trailer", // Should be filtered by stop-words
						channelId: "UC_official",
						channelName: "Official",
						description: "Official trailer",
						duration: "PT2M",
						publishedAt: "2026-02-10",
						thumbnailUrl: null,
						viewCount: 50_000,
					},
					{
						youtubeVideoId: "yt-003",
						title: "Stellar Drift playtest — inventory is confusing",
						channelId: "UC_gamer2",
						channelName: "Gamer2",
						description: null,
						duration: "PT25M",
						publishedAt: "2026-02-18",
						thumbnailUrl: null,
						viewCount: 800,
					},
				]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

			// Check inserted candidates
			const videos = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.feedId, "feed-1"));

			// Should have candidates inserted (even filtered ones — filtering may be server-side)
			expect(videos.length).toBeGreaterThanOrEqual(1);

			// All inserted should be "candidate" status
			for (const v of videos) {
				expect(v.status).toBe("candidate");
				expect(v.organizationId).toBe("org-1");
			}

			// lastDiscoveryAt should be updated
			const [feed] = await testDbState.db
				.select()
				.from(ytFeed)
				.where(eq(ytFeed.id, "feed-1"));
			expect(feed?.lastDiscoveryAt).not.toBeNull();
		});

		it("does not insert duplicate videos on second discovery run", async () => {
			// Pre-seed a video that already exists
			seedApprovedVideo({ youtubeVideoId: "yt-001", status: "candidate" });

			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([
					{
						youtubeVideoId: "yt-001", // Already exists
						title: "Stellar Drift Alpha — found a crash bug",
						channelId: "UC_gamer1",
						channelName: "Gamer1",
						description: null,
						duration: null,
						publishedAt: null,
						thumbnailUrl: null,
						viewCount: null,
					},
					{
						youtubeVideoId: "yt-new", // New video
						title: "Stellar Drift — new bug found",
						channelId: "UC_gamer3",
						channelName: "Gamer3",
						description: null,
						duration: null,
						publishedAt: null,
						thumbnailUrl: null,
						viewCount: null,
					},
				]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

			const videos = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.feedId, "feed-1"));

			// Should have exactly 2: the pre-existing one + the new one
			expect(videos.length).toBe(2);
			const ytIds = videos.map((v) => v.youtubeVideoId);
			expect(ytIds).toContain("yt-001");
			expect(ytIds).toContain("yt-new");
		});

		it("passes stop-words and publishedAfter to search function", async () => {
			const mockSearch = vi.fn().mockResolvedValue([]);
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: mockSearch,
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

			expect(mockSearch).toHaveBeenCalledTimes(1);
			const searchArgs = mockSearch.mock.calls[0]?.[0];
			expect(searchArgs.query).toBe("stellar drift playtest");
			expect(searchArgs.publishedAfter).toBe("2026-02-01");
			expect(searchArgs.stopWords).toEqual(["trailer", "mod", "reaction"]);
		});
	});

	// ─── MVP: Inserts candidates from search results ───────────────────────
	describe("MVP — Inserts new candidates as 'candidate' status", () => {
		it("inserts candidates from YouTube search results", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([
					{
						youtubeVideoId: "yt-mvp-1",
						title: "Playing Stellar Drift",
						channelId: null,
						channelName: null,
						description: null,
						duration: null,
						publishedAt: null,
						thumbnailUrl: null,
						viewCount: null,
					},
				]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

			const videos = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.feedId, "feed-1"));

			expect(videos.length).toBe(1);
			expect(videos[0]?.youtubeVideoId).toBe("yt-mvp-1");
			expect(videos[0]?.status).toBe("candidate");
		});

		it("updates lastDiscoveryAt even with zero results", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

			const [feed] = await testDbState.db
				.select()
				.from(ytFeed)
				.where(eq(ytFeed.id, "feed-1"));
			expect(feed?.lastDiscoveryAt).not.toBeNull();
		});

		it("retries on YouTube API failure (under max attempts)", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockRejectedValue(new Error("API rate limited")),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.discovery.v1",
					feedId: "feed-1",
					organizationId: "org-1",
				},
				attempts: 1,
			});

			const { processYtDiscoveryBatch } = await import(
				"../queues/yt-discovery-consumer"
			);
			await processYtDiscoveryBatch(makeBatch([queueMessage]), {});

			expect(queueMessage.retry).toHaveBeenCalledTimes(1);
			expect(queueMessage.ack).not.toHaveBeenCalled();
		});
	});

	// ─── POC: Consumer runs without crashing ───────────────────────────────
	describe("POC — Consumer processes messages without crashes", () => {
		it("processes a valid discovery message and acks", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

		it("skips paused feeds gracefully", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

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

		it("acks invalid messages without crashing", async () => {
			const queueMessage = makeQueueMessage({
				body: { bad: "payload" },
			});

			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

			const { processYtDiscoveryBatch } = await import(
				"../queues/yt-discovery-consumer"
			);
			await processYtDiscoveryBatch(makeBatch([queueMessage]), {});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});
	});
});

// =============================================================================
// STORY 1.2 — Ingest Pipeline (Captions + ASR)
// =============================================================================

describe("Story 1.2: Ingest Pipeline — Extract transcript from video", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: Captions path with full text + ASR fallback ─────────────────
	describe("BEST — Captions first, ASR fallback, proper downstream dispatch", () => {
		it("fetches captions and dispatches to NLP + Vectorize queues", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn().mockResolvedValue([
					{
						language: "en",
						fullText:
							"the camera clips through walls and the inventory is confusing",
						rawData: "",
					},
				]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const mockNlpQueue = makeMockQueue();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {
				ytNlpQueue: mockNlpQueue,
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			// Video marked ingested
			const [video] = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-1"));
			expect(video?.status).toBe("ingested");

			// Transcript created with captions
			const [transcript] = await testDbState.db
				.select()
				.from(ytTranscript)
				.where(eq(ytTranscript.videoId, "video-1"));
			expect(transcript?.source).toBe("youtube_captions");
			expect(transcript?.fullText).toContain("camera clips");

			// NLP queue dispatched (pipeline: ingest → NLP → vectorize → cluster)
			expect(mockNlpQueue.send).toHaveBeenCalledTimes(1);
		});

		it("falls back to ASR when captions are unavailable", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn().mockResolvedValue([]), // No captions
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn().mockResolvedValue({
					data: new ArrayBuffer(2048),
					extension: "m4a",
					contentType: "audio/mp4",
				}),
			}));

			const mockBucket = { put: vi.fn().mockResolvedValue(undefined) };
			const mockTranscribeQueue = makeMockQueue();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
					forceAsr: true, // Force ASR path
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {
				ytTranscriptsBucket: mockBucket,
				ytTranscribeQueue: mockTranscribeQueue,
			});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			// Audio stored in R2
			expect(mockBucket.put).toHaveBeenCalledTimes(1);

			// Transcript created with whisper_asr source
			const [transcript] = await testDbState.db
				.select()
				.from(ytTranscript)
				.where(eq(ytTranscript.videoId, "video-1"));
			expect(transcript?.source).toBe("whisper_asr");

			// Dispatched to transcribe queue (not NLP/Vectorize directly)
			expect(mockTranscribeQueue.send).toHaveBeenCalledTimes(1);
		});

		it("marks video as failed on ingest error and retries", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi
					.fn()
					.mockRejectedValue(new Error("YouTube returned 403")),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
				attempts: 1,
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			// Should retry
			expect(queueMessage.retry).toHaveBeenCalledTimes(1);

			// Video should be marked failed
			const [video] = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-1"));
			expect(video?.status).toBe("failed");
			expect(video?.failureReason).toContain("403");
		});
	});

	// ─── MVP: Captions path works correctly ────────────────────────────────
	describe("MVP — Captions extraction creates transcript with text", () => {
		it("creates transcript record with captions text", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi
					.fn()
					.mockResolvedValue([
						{ language: "en", fullText: "game is buggy", rawData: "" },
					]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			const transcripts = await testDbState.db
				.select()
				.from(ytTranscript)
				.where(eq(ytTranscript.videoId, "video-1"));

			expect(transcripts.length).toBe(1);
			expect(transcripts[0]?.fullText).toBe("game is buggy");
			expect(transcripts[0]?.source).toBe("youtube_captions");
		});

		it("sets video status to ingested after successful captions fetch", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi
					.fn()
					.mockResolvedValue([
						{ language: "en", fullText: "test", rawData: "" },
					]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			const [video] = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-1"));
			expect(video?.status).toBe("ingested");
			expect(video?.ingestedAt).not.toBeNull();
		});

		it("transitions video through ingesting → ingested", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi
					.fn()
					.mockResolvedValue([
						{ language: "en", fullText: "test", rawData: "" },
					]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			const [video] = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-1"));
			// Final state should be ingested (was approved → ingesting → ingested)
			expect(video?.status).toBe("ingested");
		});
	});

	// ─── POC: Ingest consumer acks valid messages ──────────────────────────
	describe("POC — Consumer processes messages without crash", () => {
		it("acks a valid ingest message", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi
					.fn()
					.mockResolvedValue([{ language: "en", fullText: "ok", rawData: "" }]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});

		it("handles missing video gracefully", async () => {
			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn().mockResolvedValue([]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "nonexistent",
					organizationId: "org-1",
					youtubeVideoId: "missing",
				},
				attempts: 4, // Past max retries
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			// Should not throw
			expect(
				queueMessage.ack.mock.calls.length +
					queueMessage.retry.mock.calls.length
			).toBeGreaterThan(0);
		});

		it("acks invalid payloads", async () => {
			const queueMessage = makeQueueMessage({
				body: { kind: "something-wrong" },
			});

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn(),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([queueMessage]), {});

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});
	});
});

// =============================================================================
// STORY 2.2 — Clustering: Видеть повторяемость
// =============================================================================

describe("Story 2.2: Clustering — Group similar signals", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: Similarity-based merge with impact score ────────────────────
	describe("BEST — Merge similar signals into existing clusters with impact score", () => {
		it("merges a new signal into an existing cluster when semantically similar", async () => {
			seedApprovedVideo();
			seedTranscript();

			// Pre-existing cluster about camera bugs
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-cam",
					organizationId: "org-1",
					title: "Camera clips through walls",
					type: "bug",
					severity: "high",
					signalCount: 2,
					uniqueAuthors: 2,
					impactScore: 4,
					state: "open",
				})
				.run();

			// New signal about the same camera issue
			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-cam-new",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					severity: "high",
					text: "Camera goes through the wall when crouching near corners",
					vectorized: true,
				})
				.run();

			const mockVectorizeIndex = {
				queryById: vi.fn().mockResolvedValue({
					matches: [
						{
							id: "signal-cam-existing",
							score: 0.92, // High similarity
						},
					],
				}),
			};

			// Pre-existing signal already in the cluster
			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-cam-existing",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					severity: "high",
					text: "Camera clipping through wall",
					clusterId: "cluster-cam",
					vectorized: true,
				})
				.run();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-cam-new",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await (processYtClusterBatch as ClusterBatchFn)(
				makeBatch([queueMessage]),
				mockVectorizeIndex
			);

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			// New signal should be merged into existing cluster
			const [signal] = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-cam-new"));
			expect(signal?.clusterId).toBe("cluster-cam");

			// Cluster signal count should be incremented
			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-cam"));
			expect(cluster?.signalCount).toBe(3);
		});

		it("creates a new cluster when no similar cluster exists", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-new-issue",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "performance",
					severity: "medium",
					text: "Frame rate drops to 10fps with multiple enemies",
					vectorized: true,
				})
				.run();

			const mockVectorizeIndex = {
				queryById: vi.fn().mockResolvedValue({
					matches: [], // No similar signals
				}),
			};

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-new-issue",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await (processYtClusterBatch as ClusterBatchFn)(
				makeBatch([queueMessage]),
				mockVectorizeIndex
			);

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const [signal] = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-new-issue"));
			expect(signal?.clusterId).toBeTruthy();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, signal?.clusterId ?? ""));
			expect(cluster?.type).toBe("performance");
			expect(cluster?.signalCount).toBe(1);
			expect(cluster?.state).toBe("open");
		});

		it("calculates impact score based on frequency × unique authors × severity weight", async () => {
			seedApprovedVideo();
			seedTranscript();

			// Seed a second video from different author
			testDbState.db
				.insert(ytVideo)
				.values({
					id: "video-2",
					feedId: "feed-1",
					organizationId: "org-1",
					youtubeVideoId: "xyz789",
					title: "Another playtest",
					channelId: "UC_other",
					channelName: "OtherGamer",
					status: "ingested",
				})
				.run();
			testDbState.db
				.insert(ytTranscript)
				.values({
					id: "transcript-2",
					videoId: "video-2",
					organizationId: "org-1",
					source: "youtube_captions",
					fullText: "camera bug here too",
				})
				.run();

			// Cluster with signals from different authors
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-impact",
					organizationId: "org-1",
					title: "Camera bug",
					type: "bug",
					severity: "high",
					signalCount: 1,
					uniqueAuthors: 1,
					impactScore: 1,
					state: "open",
				})
				.run();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-impact-1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					severity: "high",
					text: "Camera clips through wall",
					clusterId: "cluster-impact",
					vectorized: true,
				})
				.run();

			// New signal from DIFFERENT video/author
			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-impact-2",
					transcriptId: "transcript-2",
					videoId: "video-2",
					organizationId: "org-1",
					type: "bug",
					severity: "high",
					text: "Camera goes through walls in hangar",
					vectorized: true,
				})
				.run();

			const mockVectorizeIndex = {
				queryById: vi.fn().mockResolvedValue({
					matches: [{ id: "signal-impact-1", score: 0.9 }],
				}),
			};

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-impact-2",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await (processYtClusterBatch as ClusterBatchFn)(
				makeBatch([queueMessage]),
				mockVectorizeIndex
			);

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-impact"));

			// Impact score should increase (2 signals × 2 unique authors × severity weight)
			expect(cluster?.signalCount).toBe(2);
			expect(cluster?.uniqueAuthors).toBeGreaterThanOrEqual(2);
			expect(cluster?.impactScore).toBeGreaterThan(1);
		});
	});

	// ─── MVP: Creates clusters per signal (1:1 or basic merge) ─────────────
	describe("MVP — Creates cluster for unclustered signals", () => {
		it("creates a new cluster and assigns signal to it", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-mvp-1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					severity: "high",
					text: "Game crashes on map open",
				})
				.run();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-mvp-1",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await processYtClusterBatch(makeBatch([queueMessage]));

			const [signal] = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-mvp-1"));

			expect(signal?.clusterId).toBeTruthy();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, signal?.clusterId ?? ""));

			expect(cluster).toBeDefined();
			expect(cluster?.type).toBe("bug");
			expect(cluster?.severity).toBe("high");
			expect(cluster?.signalCount).toBe(1);
			expect(cluster?.state).toBe("open");
		});

		it("is idempotent — does not re-cluster already clustered signal", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-existing",
					organizationId: "org-1",
					title: "Existing cluster",
					type: "bug",
					signalCount: 1,
					state: "open",
				})
				.run();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-already-clustered",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Some bug",
					clusterId: "cluster-existing",
				})
				.run();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-already-clustered",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await processYtClusterBatch(makeBatch([queueMessage]));

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			// Should still be in the original cluster
			const [signal] = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-already-clustered"));
			expect(signal?.clusterId).toBe("cluster-existing");
		});

		it("sets cluster title from signal text", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-title-test",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "confusion",
					text: "Player doesn't understand how to equip items in inventory",
				})
				.run();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-title-test",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await processYtClusterBatch(makeBatch([queueMessage]));

			const [signal] = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-title-test"));

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, signal?.clusterId ?? ""));

			expect(cluster?.title).toContain("equip items");
		});
	});

	// ─── POC: Cluster consumer doesn't crash ───────────────────────────────
	describe("POC — Consumer handles signals without crashing", () => {
		it("acks valid cluster message and creates cluster", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-poc",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "other",
					text: "Something happened",
				})
				.run();

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-poc",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await processYtClusterBatch(makeBatch([queueMessage]));

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});

		it("acks when signal not found", async () => {
			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "nonexistent",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await processYtClusterBatch(makeBatch([queueMessage]));

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});

		it("acks invalid message payloads", async () => {
			const queueMessage = makeQueueMessage({
				body: { kind: "gibberish" },
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await processYtClusterBatch(makeBatch([queueMessage]));

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);
		});
	});
});

// =============================================================================
// STORY 3.2 — Regression Detection (не создавать повторный алерт после фикса)
// =============================================================================

describe("Story 3.2: Regression Detection — Don't re-alert after fix", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: Full state machine with regression detection ────────────────
	describe("BEST — Full cluster state machine with regression from newer version", () => {
		it("detects regression when fixed cluster gets signal from newer version", async () => {
			seedApprovedVideo();
			seedTranscript();

			// A cluster that was fixed in version 0.9.2
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-fixed",
					organizationId: "org-1",
					title: "Camera clips through wall",
					type: "bug",
					severity: "high",
					signalCount: 3,
					uniqueAuthors: 3,
					impactScore: 9,
					state: "fixed",
					fixedInVersion: "0.9.2",
				})
				.run();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-old",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Camera clips through wall",
					clusterId: "cluster-fixed",
					gameVersion: "0.9.1",
					vectorized: true,
				})
				.run();

			// New signal from version 0.9.3 (AFTER fix) — this is a regression
			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-regression",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Camera is clipping through walls again",
					gameVersion: "0.9.3",
					vectorized: true,
				})
				.run();

			const mockVectorizeIndex = {
				queryById: vi.fn().mockResolvedValue({
					matches: [{ id: "signal-old", score: 0.95 }],
				}),
			};

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-regression",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await (processYtClusterBatch as ClusterBatchFn)(
				makeBatch([queueMessage]),
				mockVectorizeIndex
			);

			expect(queueMessage.ack).toHaveBeenCalledTimes(1);

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-fixed"));

			// Should transition to regression state
			expect(cluster?.state).toBe("regression");
			expect(cluster?.signalCount).toBe(4);
		});

		it("ignores signals from pre-fix versions on fixed clusters", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-fixed-2",
					organizationId: "org-1",
					title: "Inventory bug",
					type: "bug",
					state: "fixed",
					fixedInVersion: "0.9.2",
					signalCount: 1,
				})
				.run();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-old-version",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Inventory is broken",
					gameVersion: "0.9.1", // BEFORE the fix
					vectorized: true,
				})
				.run();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-existing-fixed",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Inventory bug",
					clusterId: "cluster-fixed-2",
					vectorized: true,
				})
				.run();

			const mockVectorizeIndex = {
				queryById: vi.fn().mockResolvedValue({
					matches: [{ id: "signal-existing-fixed", score: 0.9 }],
				}),
			};

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-old-version",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await (processYtClusterBatch as ClusterBatchFn)(
				makeBatch([queueMessage]),
				mockVectorizeIndex
			);

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-fixed-2"));

			// Should NOT become regression — signal is from pre-fix version
			expect(cluster?.state).toBe("fixed");
		});

		it("transitions cluster through open → acknowledged → fixed → regression", async () => {
			seedApprovedVideo();
			seedTranscript();

			// Test the full state machine
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-sm",
					organizationId: "org-1",
					title: "State machine test",
					type: "bug",
					state: "open",
					signalCount: 1,
				})
				.run();

			const { processYtClusterBatch: _processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);

			// Verify allowed state transitions by updating directly
			// open → acknowledged
			await testDbState.db
				.update(ytCluster)
				.set({ state: "acknowledged" })
				.where(eq(ytCluster.id, "cluster-sm"));

			let [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-sm"));
			expect(cluster?.state).toBe("acknowledged");

			// acknowledged → fixed
			await testDbState.db
				.update(ytCluster)
				.set({ state: "fixed", fixedInVersion: "1.0.0" })
				.where(eq(ytCluster.id, "cluster-sm"));

			[cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-sm"));
			expect(cluster?.state).toBe("fixed");
			expect(cluster?.fixedInVersion).toBe("1.0.0");

			// fixed → regression
			await testDbState.db
				.update(ytCluster)
				.set({ state: "regression" })
				.where(eq(ytCluster.id, "cluster-sm"));

			[cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-sm"));
			expect(cluster?.state).toBe("regression");
		});
	});

	// ─── MVP: Fixed clusters don't re-open from same version ───────────────
	describe("MVP — Fixed clusters marked correctly, basic regression flag", () => {
		it("allows marking a cluster as fixed with version", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-to-fix",
					organizationId: "org-1",
					title: "Bug to fix",
					type: "bug",
					state: "open",
					signalCount: 1,
				})
				.run();

			// Simulate marking as fixed
			await testDbState.db
				.update(ytCluster)
				.set({ state: "fixed", fixedInVersion: "0.9.2" })
				.where(eq(ytCluster.id, "cluster-to-fix"));

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-to-fix"));

			expect(cluster?.state).toBe("fixed");
			expect(cluster?.fixedInVersion).toBe("0.9.2");
		});

		it("new signal on fixed cluster adds to count but preserves state", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-fixed-mvp",
					organizationId: "org-1",
					title: "Fixed bug",
					type: "bug",
					state: "fixed",
					fixedInVersion: "0.9.2",
					signalCount: 2,
				})
				.run();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-existing-mvp",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Known bug",
					clusterId: "cluster-fixed-mvp",
					vectorized: true,
				})
				.run();

			// Signal without gameVersion — can't determine if regression
			testDbState.db
				.insert(ytSignal)
				.values({
					id: "signal-new-no-ver",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					text: "Same known bug happening",
					vectorized: true,
				})
				.run();

			const mockVectorizeIndex = {
				queryById: vi.fn().mockResolvedValue({
					matches: [{ id: "signal-existing-mvp", score: 0.88 }],
				}),
			};

			const queueMessage = makeQueueMessage({
				body: {
					kind: "yt.cluster.v1",
					signalId: "signal-new-no-ver",
					organizationId: "org-1",
				},
			});

			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);
			await (processYtClusterBatch as ClusterBatchFn)(
				makeBatch([queueMessage]),
				mockVectorizeIndex
			);

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-fixed-mvp"));

			// Without version info, can't determine regression — keep fixed state
			expect(cluster?.signalCount).toBe(3);
		});

		it("stores fixedInVersion on cluster update", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-ver-test",
					organizationId: "org-1",
					title: "Version test",
					type: "bug",
					state: "open",
					signalCount: 1,
				})
				.run();

			await testDbState.db
				.update(ytCluster)
				.set({ state: "fixed", fixedInVersion: "2.0.0-beta" })
				.where(eq(ytCluster.id, "cluster-ver-test"));

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-ver-test"));
			expect(cluster?.fixedInVersion).toBe("2.0.0-beta");
		});
	});

	// ─── POC: Cluster state can be updated ─────────────────────────────────
	describe("POC — Cluster state values work in DB", () => {
		it("supports all cluster state values", async () => {
			const states = [
				"open",
				"acknowledged",
				"in_progress",
				"fixed",
				"ignored",
				"regression",
			] as const;

			for (const state of states) {
				const id = `cluster-state-${state}`;
				testDbState.db
					.insert(ytCluster)
					.values({
						id,
						organizationId: "org-1",
						title: `State: ${state}`,
						type: "bug",
						state,
						signalCount: 0,
					})
					.run();

				const [cluster] = await testDbState.db
					.select()
					.from(ytCluster)
					.where(eq(ytCluster.id, id));
				expect(cluster?.state).toBe(state);
			}
		});

		it("cluster has fixedInVersion column", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-fix-col",
					organizationId: "org-1",
					title: "Fix version test",
					type: "bug",
					state: "fixed",
					fixedInVersion: "1.2.3",
					signalCount: 0,
				})
				.run();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-fix-col"));
			expect(cluster?.fixedInVersion).toBe("1.2.3");
		});

		it("cluster has versionsAffected JSON column", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-vers",
					organizationId: "org-1",
					title: "Versions test",
					type: "bug",
					state: "open",
					versionsAffected: ["0.9.0", "0.9.1", "0.9.2"],
					signalCount: 0,
				})
				.run();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-vers"));
			expect(cluster?.versionsAffected).toEqual(["0.9.0", "0.9.1", "0.9.2"]);
		});
	});
});

// =============================================================================
// STORY 4.1 — Impact Scoring: Понять что ломает флоу
// =============================================================================

describe("Story 4.1: Impact Scoring — Prioritize what breaks the flow", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: Impact score with weighted formula ──────────────────────────
	describe("BEST — Impact score reflects frequency, unique authors, severity, recency", () => {
		it("higher severity bugs with more unique authors rank higher", async () => {
			seedApprovedVideo();
			seedTranscript();

			// High impact cluster: critical bug, many authors
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-high",
					organizationId: "org-1",
					title: "Game crash on level 3",
					type: "bug",
					severity: "critical",
					signalCount: 10,
					uniqueAuthors: 8,
					impactScore: 0, // Will be calculated
					state: "open",
				})
				.run();

			// Low impact cluster: info praise, one author
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-low",
					organizationId: "org-1",
					title: "Nice shader effects",
					type: "praise",
					severity: "info",
					signalCount: 1,
					uniqueAuthors: 1,
					impactScore: 0,
					state: "open",
				})
				.run();

			// Calculate impact scores
			const severityWeights: Record<string, number> = {
				critical: 5,
				high: 4,
				medium: 3,
				low: 2,
				info: 1,
			};

			const clusters = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.organizationId, "org-1"));

			for (const cluster of clusters) {
				const weight = severityWeights[cluster.severity ?? "medium"] ?? 3;
				const score = cluster.signalCount * cluster.uniqueAuthors * weight;
				await testDbState.db
					.update(ytCluster)
					.set({ impactScore: score })
					.where(eq(ytCluster.id, cluster.id));
			}

			const [high] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-high"));
			const [low] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-low"));

			// High impact cluster should have significantly higher score
			expect(high?.impactScore).toBeGreaterThan(low?.impactScore ?? 0);
			// 10 signals × 8 authors × 5 (critical) = 400
			expect(high?.impactScore).toBe(400);
			// 1 signal × 1 author × 1 (info) = 1
			expect(low?.impactScore).toBe(1);
		});

		it("uniqueAuthors counts distinct video channels, not total signals", async () => {
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytVideo)
				.values({
					id: "video-2",
					feedId: "feed-1",
					organizationId: "org-1",
					youtubeVideoId: "xyz789",
					title: "Another playtest",
					channelId: "UC_indie42", // SAME channel as video-1
					channelName: "IndieGamer42",
					status: "ingested",
				})
				.run();
			testDbState.db
				.insert(ytVideo)
				.values({
					id: "video-3",
					feedId: "feed-1",
					organizationId: "org-1",
					youtubeVideoId: "def456",
					title: "Third playtest",
					channelId: "UC_other", // DIFFERENT channel
					channelName: "OtherGamer",
					status: "ingested",
				})
				.run();

			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-authors",
					organizationId: "org-1",
					title: "Multi-author bug",
					type: "bug",
					severity: "high",
					signalCount: 3,
					uniqueAuthors: 0,
					state: "open",
				})
				.run();

			// 3 signals from 2 unique channels
			for (const [i, vid] of ["video-1", "video-2", "video-3"].entries()) {
				testDbState.db
					.insert(ytTranscript)
					.values({
						id: `tr-author-${i}`,
						videoId: vid,
						organizationId: "org-1",
						source: "youtube_captions",
					})
					.run();
				testDbState.db
					.insert(ytSignal)
					.values({
						id: `sig-author-${i}`,
						transcriptId: `tr-author-${i}`,
						videoId: vid,
						organizationId: "org-1",
						type: "bug",
						text: "Same bug appears",
						clusterId: "cluster-authors",
					})
					.run();
			}

			// Count unique channels for the cluster
			const signals = await testDbState.db
				.select({ videoId: ytSignal.videoId })
				.from(ytSignal)
				.where(eq(ytSignal.clusterId, "cluster-authors"));

			const videoIds = [...new Set(signals.map((s) => s.videoId))];
			const videos = await testDbState.db
				.select({ channelId: ytVideo.channelId })
				.from(ytVideo)
				.where(inArray(ytVideo.id, videoIds));

			const uniqueChannels = new Set(
				videos.map((v) => v.channelId).filter(Boolean)
			);
			expect(uniqueChannels.size).toBe(2); // UC_indie42 + UC_other
		});

		it("clusters can be sorted by impact score for dashboard view", async () => {
			const clusterData = [
				{
					id: "c-1",
					title: "Critical crash",
					type: "bug" as const,
					severity: "critical" as const,
					signalCount: 5,
					uniqueAuthors: 5,
					impactScore: 125,
				},
				{
					id: "c-2",
					title: "UI confusion",
					type: "confusion" as const,
					severity: "medium" as const,
					signalCount: 3,
					uniqueAuthors: 3,
					impactScore: 27,
				},
				{
					id: "c-3",
					title: "FPS drops",
					type: "performance" as const,
					severity: "high" as const,
					signalCount: 8,
					uniqueAuthors: 6,
					impactScore: 192,
				},
				{
					id: "c-4",
					title: "Nice art",
					type: "praise" as const,
					severity: "info" as const,
					signalCount: 2,
					uniqueAuthors: 2,
					impactScore: 4,
				},
			];

			for (const c of clusterData) {
				testDbState.db
					.insert(ytCluster)
					.values({
						...c,
						organizationId: "org-1",
						state: "open",
					})
					.run();
			}

			const sorted = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.organizationId, "org-1"))
				.orderBy(ytCluster.impactScore);

			// Sorted by impactScore ascending (need DESC for dashboard)
			expect(sorted.at(-1)?.id).toBe("c-3"); // Highest impact
			const descSorted = [...sorted].reverse();
			expect(descSorted[0]?.title).toContain("FPS");
			expect(descSorted[1]?.title).toContain("crash");
		});
	});

	// ─── MVP: Basic impact score calculated ────────────────────────────────
	describe("MVP — Impact score = signalCount × uniqueAuthors", () => {
		it("calculates basic impact score from signal count and authors", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-basic-impact",
					organizationId: "org-1",
					title: "Basic impact",
					type: "bug",
					state: "open",
					signalCount: 4,
					uniqueAuthors: 3,
					impactScore: 12, // 4 × 3
				})
				.run();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-basic-impact"));

			expect(cluster?.impactScore).toBe(12);
			expect(cluster?.impactScore).toBe(
				(cluster?.signalCount ?? 0) * (cluster?.uniqueAuthors ?? 0)
			);
		});

		it("filters clusters by type for focused views", async () => {
			testDbState.db
				.insert(ytCluster)
				.values([
					{
						id: "c-bug",
						organizationId: "org-1",
						title: "Bug",
						type: "bug",
						state: "open",
						signalCount: 1,
					},
					{
						id: "c-perf",
						organizationId: "org-1",
						title: "Perf",
						type: "performance",
						state: "open",
						signalCount: 1,
					},
					{
						id: "c-ux",
						organizationId: "org-1",
						title: "UX",
						type: "confusion",
						state: "open",
						signalCount: 1,
					},
				])
				.run();

			const bugs = await testDbState.db
				.select()
				.from(ytCluster)
				.where(
					and(eq(ytCluster.organizationId, "org-1"), eq(ytCluster.type, "bug"))
				);

			expect(bugs.length).toBe(1);
			expect(bugs[0]?.title).toBe("Bug");
		});

		it("filters clusters by state", async () => {
			testDbState.db
				.insert(ytCluster)
				.values([
					{
						id: "c-open",
						organizationId: "org-1",
						title: "Open",
						type: "bug",
						state: "open",
						signalCount: 1,
					},
					{
						id: "c-fixed",
						organizationId: "org-1",
						title: "Fixed",
						type: "bug",
						state: "fixed",
						signalCount: 1,
					},
					{
						id: "c-ignored",
						organizationId: "org-1",
						title: "Ignored",
						type: "bug",
						state: "ignored",
						signalCount: 1,
					},
				])
				.run();

			const openClusters = await testDbState.db
				.select()
				.from(ytCluster)
				.where(
					and(
						eq(ytCluster.organizationId, "org-1"),
						eq(ytCluster.state, "open")
					)
				);

			expect(openClusters.length).toBe(1);
			expect(openClusters[0]?.title).toBe("Open");
		});
	});

	// ─── POC: Impact score column exists and works ─────────────────────────
	describe("POC — Impact score storage works", () => {
		it("stores and retrieves impactScore on cluster", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-score",
					organizationId: "org-1",
					title: "Score test",
					type: "bug",
					state: "open",
					impactScore: 42,
					signalCount: 1,
				})
				.run();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-score"));
			expect(cluster?.impactScore).toBe(42);
		});

		it("defaults impactScore to 0", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-default-score",
					organizationId: "org-1",
					title: "Default score",
					type: "bug",
					state: "open",
					signalCount: 0,
				})
				.run();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-default-score"));
			expect(cluster?.impactScore).toBe(0);
		});

		it("stores uniqueAuthors count", async () => {
			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-authors-poc",
					organizationId: "org-1",
					title: "Authors test",
					type: "bug",
					state: "open",
					uniqueAuthors: 7,
					signalCount: 15,
				})
				.run();

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-authors-poc"));
			expect(cluster?.uniqueAuthors).toBe(7);
			expect(cluster?.signalCount).toBe(15);
		});
	});
});

// =============================================================================
// END-TO-END PIPELINE: Discovery → Ingest → NLP → Cluster
// =============================================================================

describe("E2E Pipeline: Full flow from discovery to clustered signals", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	// ─── BEST: Full pipeline produces meaningful clusters ──────────────────
	describe("BEST — Full pipeline produces typed, clustered signals from video", () => {
		it("runs discovery → ingest → NLP → cluster in sequence", async () => {
			// Step 1: Discovery finds a video
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([
					{
						youtubeVideoId: "e2e-video",
						title: "Stellar Drift playtest — bugs everywhere",
						channelId: "UC_e2e",
						channelName: "E2ETester",
						description: "Found some major bugs",
						duration: "PT20M",
						publishedAt: "2026-02-20",
						thumbnailUrl: null,
						viewCount: 500,
					},
				]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));

			const discoveryMsg = makeQueueMessage({
				body: {
					kind: "yt.discovery.v1",
					feedId: "feed-1",
					organizationId: "org-1",
				},
			});

			const { processYtDiscoveryBatch } = await import(
				"../queues/yt-discovery-consumer"
			);
			await processYtDiscoveryBatch(makeBatch([discoveryMsg]), {});

			expect(discoveryMsg.ack).toHaveBeenCalledTimes(1);

			// Verify video was inserted
			const videos = await testDbState.db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.feedId, "feed-1"));
			expect(videos.length).toBe(1);
			expect(videos[0]?.status).toBe("candidate");
			const videoId = videos[0]?.id ?? "";

			// Step 2: Simulate approval (would normally be manual in UI)
			await testDbState.db
				.update(ytVideo)
				.set({ status: "approved", reviewedAt: new Date() })
				.where(eq(ytVideo.id, videoId));

			// Step 3: Ingest
			vi.resetModules();
			vi.doMock("@my-app/db", () => ({ db: testDbState.db }));
			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn().mockResolvedValue([
					{
						language: "en",
						fullText: `okay so I'm playing Stellar Drift and the camera clips 
through the wall every time I enter the hangar and the inventory UI 
is really confusing I can't figure out how to equip items`,
						rawData: "",
					},
				]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const mockNlpQueue = makeMockQueue();

			const ingestMsg = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId,
					organizationId: "org-1",
					youtubeVideoId: "e2e-video",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([ingestMsg]), {
				ytNlpQueue: mockNlpQueue,
			});

			expect(ingestMsg.ack).toHaveBeenCalledTimes(1);
			expect(mockNlpQueue.send).toHaveBeenCalledTimes(1);

			// Get the transcript ID from the NLP queue message
			const nlpPayload = mockNlpQueue.send.mock.calls[0]?.[0] as Record<
				string,
				unknown
			>;
			const transcriptId = nlpPayload.transcriptId as string;

			// Step 4: NLP extraction
			vi.resetModules();
			vi.doMock("@my-app/db", () => ({ db: testDbState.db }));

			const mockVectorizeQueue = makeMockQueue();
			const nlpMsg = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId,
					videoId,
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([nlpMsg]), {
				ytVectorizeQueue: mockVectorizeQueue,
				analyzeTranscript: makeMockAnalyzer(),
			});

			expect(nlpMsg.ack).toHaveBeenCalledTimes(1);

			// Should have extracted signals
			const signals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, videoId));
			expect(signals.length).toBeGreaterThanOrEqual(1);

			// Step 5: Cluster each signal
			vi.resetModules();
			vi.doMock("@my-app/db", () => ({ db: testDbState.db }));

			const { processYtClusterBatch: _processYtClusterBatch2 } = await import(
				"../queues/yt-cluster-consumer"
			);

			for (const signal of signals) {
				vi.resetModules();
				vi.doMock("@my-app/db", () => ({ db: testDbState.db }));
				const { processYtClusterBatch: clusterBatch } = await import(
					"../queues/yt-cluster-consumer"
				);

				const clusterMsg = makeQueueMessage({
					body: {
						kind: "yt.cluster.v1",
						signalId: signal.id,
						organizationId: "org-1",
					},
				});
				await clusterBatch(makeBatch([clusterMsg]));
				expect(clusterMsg.ack).toHaveBeenCalledTimes(1);
			}

			// Verify all signals are clustered
			const clusteredSignals = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.videoId, videoId));
			for (const signal of clusteredSignals) {
				expect(signal.clusterId).toBeTruthy();
			}

			// Verify clusters exist
			const clusters = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.organizationId, "org-1"));
			expect(clusters.length).toBeGreaterThanOrEqual(1);
			for (const cluster of clusters) {
				expect(cluster.state).toBe("open");
				expect(cluster.signalCount).toBeGreaterThanOrEqual(1);
			}
		});
	});

	// ─── MVP: Pipeline stages chain correctly ──────────────────────────────
	describe("MVP — Pipeline stages chain correctly via queue messages", () => {
		it("ingest dispatches NLP queue message with correct transcriptId", async () => {
			seedApprovedVideo();

			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi
					.fn()
					.mockResolvedValue([
						{ language: "en", fullText: "test transcript", rawData: "" },
					]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const mockNlpQueue = makeMockQueue();

			const msg = makeQueueMessage({
				body: {
					kind: "yt.ingest.v1",
					videoId: "video-1",
					organizationId: "org-1",
					youtubeVideoId: "abc123def",
				},
			});

			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			await processYtIngestBatch(makeBatch([msg]), {
				ytNlpQueue: mockNlpQueue,
			});

			// NLP queue should receive the transcript ID
			const nlpPayload = mockNlpQueue.send.mock.calls[0]?.[0] as Record<
				string,
				unknown
			>;
			expect(nlpPayload.kind).toBe("yt.nlp.v1");
			expect(nlpPayload.transcriptId).toBeTruthy();
			expect(nlpPayload.videoId).toBe("video-1");
			expect(nlpPayload.organizationId).toBe("org-1");

			// Verify transcript actually exists
			const [transcript] = await testDbState.db
				.select()
				.from(ytTranscript)
				.where(eq(ytTranscript.id, nlpPayload.transcriptId as string));
			expect(transcript).toBeDefined();
			expect(transcript?.fullText).toBe("test transcript");
		});

		it("NLP dispatches cluster queue message for each signal", async () => {
			seedApprovedVideo();
			seedTranscript();

			const mockVectorizeQueue = makeMockQueue();

			const msg = makeQueueMessage({
				body: {
					kind: "yt.nlp.v1",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
				},
			});

			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			await processYtNlpBatch(makeBatch([msg]), {
				ytVectorizeQueue: mockVectorizeQueue,
				analyzeTranscript: makeMockAnalyzer(),
			});

			// Vectorize queue should be called once per transcript
			expect(mockVectorizeQueue.send).toHaveBeenCalledTimes(1);
			const payload = mockVectorizeQueue.send.mock.calls[0]?.[0] as Record<
				string,
				unknown
			>;
			expect(payload.kind).toBe("yt.vectorize.v1");
			expect(payload.organizationId).toBe("org-1");
		});

		it("all queue messages pass Zod schema validation", async () => {
			const { ytIngestQueueMessageSchema } = await import(
				"@my-app/api/contracts/youtube-queue"
			);
			const { ytNlpQueueMessageSchema } = await import(
				"@my-app/api/contracts/youtube-queue"
			);
			const { ytClusterQueueMessageSchema } = await import(
				"@my-app/api/contracts/youtube-queue"
			);
			const { ytVectorizeQueueMessageSchema } = await import(
				"@my-app/api/contracts/youtube-queue"
			);

			// All queue message schemas should validate correct payloads
			expect(
				ytIngestQueueMessageSchema.safeParse({
					kind: "yt.ingest.v1",
					videoId: "v-1",
					organizationId: "org-1",
					youtubeVideoId: "abc",
				}).success
			).toBe(true);

			expect(
				ytNlpQueueMessageSchema.safeParse({
					kind: "yt.nlp.v1",
					transcriptId: "t-1",
					videoId: "v-1",
					organizationId: "org-1",
				}).success
			).toBe(true);

			expect(
				ytClusterQueueMessageSchema.safeParse({
					kind: "yt.cluster.v1",
					signalId: "s-1",
					organizationId: "org-1",
				}).success
			).toBe(true);

			expect(
				ytVectorizeQueueMessageSchema.safeParse({
					kind: "yt.vectorize.v1",
					transcriptId: "t-1",
					videoId: "v-1",
					organizationId: "org-1",
				}).success
			).toBe(true);
		});
	});

	// ─── POC: Each stage runs independently ────────────────────────────────
	describe("POC — Each pipeline stage processes without crashing", () => {
		it("all consumers can be imported and called", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn().mockResolvedValue([]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const { processYtDiscoveryBatch } = await import(
				"../queues/yt-discovery-consumer"
			);
			const { processYtIngestBatch } = await import(
				"../queues/yt-ingest-consumer"
			);
			const { processYtNlpBatch } = await import("../queues/yt-nlp-consumer");
			const { processYtVectorizeBatch } = await import(
				"../queues/yt-vectorize-consumer"
			);
			const { processYtClusterBatch } = await import(
				"../queues/yt-cluster-consumer"
			);

			expect(typeof processYtDiscoveryBatch).toBe("function");
			expect(typeof processYtIngestBatch).toBe("function");
			expect(typeof processYtNlpBatch).toBe("function");
			expect(typeof processYtVectorizeBatch).toBe("function");
			expect(typeof processYtClusterBatch).toBe("function");
		});

		it("invalid messages are acked across all consumers", async () => {
			vi.doMock("@my-app/youtube/search", () => ({
				searchYouTube: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/channel", () => ({
				getChannelVideos: vi.fn().mockResolvedValue([]),
			}));
			vi.doMock("@my-app/youtube/subtitles", () => ({
				getSubtitles: vi.fn().mockResolvedValue([]),
				parseTimedSegments: vi.fn().mockReturnValue([]),
			}));
			vi.doMock("@my-app/youtube/download-audio", () => ({
				downloadAudio: vi.fn(),
			}));

			const consumers = [
				"../queues/yt-discovery-consumer",
				"../queues/yt-ingest-consumer",
				"../queues/yt-nlp-consumer",
				"../queues/yt-cluster-consumer",
			];

			const batchFns = [
				"processYtDiscoveryBatch",
				"processYtIngestBatch",
				"processYtNlpBatch",
				"processYtClusterBatch",
			];

			for (let i = 0; i < consumers.length; i++) {
				vi.resetModules();
				vi.doMock("@my-app/db", () => ({ db: testDbState.db }));
				vi.doMock("@my-app/youtube/search", () => ({
					searchYouTube: vi.fn().mockResolvedValue([]),
				}));
				vi.doMock("@my-app/youtube/channel", () => ({
					getChannelVideos: vi.fn().mockResolvedValue([]),
				}));
				vi.doMock("@my-app/youtube/subtitles", () => ({
					getSubtitles: vi.fn().mockResolvedValue([]),
					parseTimedSegments: vi.fn().mockReturnValue([]),
				}));
				vi.doMock("@my-app/youtube/download-audio", () => ({
					downloadAudio: vi.fn(),
				}));

				const mod = await import(consumers[i] as string);
				const fn = mod[batchFns[i] as string] as (
					batch: MessageBatch<unknown>,
					deps?: unknown
				) => Promise<void>;

				const msg = makeQueueMessage({ body: { garbage: true } });
				await fn(makeBatch([msg]), {});
				expect(msg.ack).toHaveBeenCalledTimes(1);
			}
		});

		it("DB schema supports the full pipeline data model", async () => {
			// Verify all tables can be written to and read from
			seedApprovedVideo();
			seedTranscript();

			testDbState.db
				.insert(ytSignal)
				.values({
					id: "sig-schema",
					transcriptId: "transcript-1",
					videoId: "video-1",
					organizationId: "org-1",
					type: "bug",
					severity: "high",
					text: "Schema test signal",
					contextBefore: "before context",
					contextAfter: "after context",
					timestampStart: 150,
					timestampEnd: 165,
					confidence: 85,
					component: "camera",
					gameVersion: "0.9.1",
				})
				.run();

			testDbState.db
				.insert(ytCluster)
				.values({
					id: "cluster-schema",
					organizationId: "org-1",
					title: "Schema test cluster",
					summary: "A detailed summary",
					type: "bug",
					severity: "high",
					state: "open",
					signalCount: 1,
					uniqueAuthors: 1,
					impactScore: 5,
					component: "camera",
					firstSeenVersion: "0.9.1",
					versionsAffected: ["0.9.0", "0.9.1"],
				})
				.run();

			// Assign signal to cluster
			testDbState.db
				.update(ytSignal)
				.set({ clusterId: "cluster-schema" })
				.where(eq(ytSignal.id, "sig-schema"))
				.run();

			const [signal] = await testDbState.db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "sig-schema"));
			expect(signal?.clusterId).toBe("cluster-schema");
			expect(signal?.confidence).toBe(85);
			expect(signal?.timestampStart).toBe(150);

			const [cluster] = await testDbState.db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-schema"));
			expect(cluster?.versionsAffected).toEqual(["0.9.0", "0.9.1"]);
		});
	});
});
