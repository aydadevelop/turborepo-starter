import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { organization, user } from "../schema/auth";
import {
	ytCluster,
	ytFeed,
	ytSignal,
	ytTranscript,
	ytVideo,
} from "../schema/youtube";
import {
	clearTestDatabase,
	createTestDatabase,
	type TestDatabase,
} from "../test";

describe("YouTube Schema", () => {
	let db: TestDatabase;
	let close: () => void;

	beforeEach(() => {
		const testDb = createTestDatabase();
		db = testDb.db;
		close = testDb.close;

		db.insert(user)
			.values({
				id: "user-yt-1",
				name: "Test User",
				email: "yt-test@example.com",
				emailVerified: true,
			})
			.run();
		db.insert(organization)
			.values({ id: "org-yt-1", name: "Test Org", slug: "test-org" })
			.run();
	});

	afterEach(() => {
		close();
	});

	describe("ytFeed", () => {
		it("creates a feed with defaults", async () => {
			await db.insert(ytFeed).values({
				id: "feed-1",
				organizationId: "org-yt-1",
				name: "Alpha Playtest",
				gameTitle: "My Game",
				searchQuery: "my game alpha playtest",
			});

			const [row] = await db
				.select()
				.from(ytFeed)
				.where(eq(ytFeed.id, "feed-1"));
			expect(row).toBeDefined();
			expect(row?.status).toBe("active");
			expect(row?.lastDiscoveryAt).toBeNull();
			expect(row?.createdAt).toBeInstanceOf(Date);
		});

		it("cascades delete when organization is deleted", async () => {
			await db.insert(ytFeed).values({
				id: "feed-cascade-1",
				organizationId: "org-yt-1",
				name: "Cascade Feed",
				gameTitle: "Game",
				searchQuery: "query",
			});

			await db.delete(organization).where(eq(organization.id, "org-yt-1"));
			const feeds = await db.select().from(ytFeed);
			expect(feeds).toHaveLength(0);
		});
	});

	describe("ytVideo", () => {
		beforeEach(async () => {
			await db.insert(ytFeed).values({
				id: "feed-v-1",
				organizationId: "org-yt-1",
				name: "Feed for Videos",
				gameTitle: "Game",
				searchQuery: "query",
			});
		});

		it("creates a video with defaults", async () => {
			await db.insert(ytVideo).values({
				id: "video-1",
				feedId: "feed-v-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "dQw4w9WgXcQ",
				title: "Test Video",
			});

			const [row] = await db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-1"));
			expect(row?.status).toBe("candidate");
			expect(row?.rejectionReason).toBeNull();
		});

		it("enforces unique (feedId, youtubeVideoId)", async () => {
			await db.insert(ytVideo).values({
				id: "video-dup-1",
				feedId: "feed-v-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "abc123",
				title: "First",
			});

			await expect(
				db.insert(ytVideo).values({
					id: "video-dup-2",
					feedId: "feed-v-1",
					organizationId: "org-yt-1",
					youtubeVideoId: "abc123",
					title: "Duplicate",
				})
			).rejects.toThrow();
		});

		it("allows same youtubeVideoId in different feeds", async () => {
			await db.insert(ytFeed).values({
				id: "feed-v-2",
				organizationId: "org-yt-1",
				name: "Other Feed",
				gameTitle: "Game",
				searchQuery: "other",
			});

			await db.insert(ytVideo).values({
				id: "video-f1",
				feedId: "feed-v-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "same-id",
				title: "In feed 1",
			});
			await db.insert(ytVideo).values({
				id: "video-f2",
				feedId: "feed-v-2",
				organizationId: "org-yt-1",
				youtubeVideoId: "same-id",
				title: "In feed 2",
			});

			const videos = await db.select().from(ytVideo);
			expect(videos).toHaveLength(2);
		});

		it("cascades delete when feed is deleted", async () => {
			await db.insert(ytVideo).values({
				id: "video-cascade-1",
				feedId: "feed-v-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "xyz789",
				title: "Will cascade",
			});

			await db.delete(ytFeed).where(eq(ytFeed.id, "feed-v-1"));
			const videos = await db.select().from(ytVideo);
			expect(videos).toHaveLength(0);
		});

		it("stores and retrieves JSON tags", async () => {
			await db.insert(ytVideo).values({
				id: "video-tags-1",
				feedId: "feed-v-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "tags123",
				title: "Tagged",
				tags: ["alpha", "playtest", "bugs"],
			});

			const [row] = await db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-tags-1"));
			expect(row?.tags).toEqual(["alpha", "playtest", "bugs"]);
		});

		it("tracks review metadata", async () => {
			await db.insert(ytVideo).values({
				id: "video-review-1",
				feedId: "feed-v-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "rev123",
				title: "Review Me",
			});

			const now = new Date();
			await db
				.update(ytVideo)
				.set({
					status: "approved",
					reviewedByUserId: "user-yt-1",
					reviewedAt: now,
				})
				.where(eq(ytVideo.id, "video-review-1"));

			const [row] = await db
				.select()
				.from(ytVideo)
				.where(eq(ytVideo.id, "video-review-1"));
			expect(row?.status).toBe("approved");
			expect(row?.reviewedByUserId).toBe("user-yt-1");
			expect(row?.reviewedAt).toEqual(now);
		});
	});

	describe("ytTranscript", () => {
		beforeEach(async () => {
			await db.insert(ytFeed).values({
				id: "feed-t-1",
				organizationId: "org-yt-1",
				name: "Feed",
				gameTitle: "Game",
				searchQuery: "query",
			});
			await db.insert(ytVideo).values({
				id: "video-t-1",
				feedId: "feed-t-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "trans123",
				title: "Transcript Video",
			});
		});

		it("creates a transcript with all fields", async () => {
			await db.insert(ytTranscript).values({
				id: "transcript-1",
				videoId: "video-t-1",
				organizationId: "org-yt-1",
				source: "youtube_captions",
				language: "en",
				r2Key: "transcripts/org-yt-1/transcript-1.vtt",
				fullText: "This is a cool game but I found a bug at 3:45",
				durationSeconds: 600,
				segmentCount: 42,
				tokenCount: 120,
			});

			const [row] = await db
				.select()
				.from(ytTranscript)
				.where(eq(ytTranscript.id, "transcript-1"));
			expect(row?.source).toBe("youtube_captions");
			expect(row?.fullText).toContain("bug");
			expect(row?.tokenCount).toBe(120);
		});

		it("cascades delete when video is deleted", async () => {
			await db.insert(ytTranscript).values({
				id: "transcript-cascade-1",
				videoId: "video-t-1",
				organizationId: "org-yt-1",
				source: "whisper_asr",
			});

			await db.delete(ytVideo).where(eq(ytVideo.id, "video-t-1"));
			const transcripts = await db.select().from(ytTranscript);
			expect(transcripts).toHaveLength(0);
		});
	});

	describe("ytCluster", () => {
		it("creates a cluster with defaults", async () => {
			await db.insert(ytCluster).values({
				id: "cluster-1",
				organizationId: "org-yt-1",
				title: "Camera stuck on walls",
			});

			const [row] = await db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-1"));
			expect(row?.state).toBe("open");
			expect(row?.signalCount).toBe(0);
			expect(row?.impactScore).toBe(0);
		});

		it("supports all state transitions", async () => {
			await db.insert(ytCluster).values({
				id: "cluster-states",
				organizationId: "org-yt-1",
				title: "State test",
			});

			const states = [
				"acknowledged",
				"in_progress",
				"fixed",
				"regression",
				"ignored",
			] as const;

			for (const state of states) {
				await db
					.update(ytCluster)
					.set({ state })
					.where(eq(ytCluster.id, "cluster-states"));

				const [row] = await db
					.select()
					.from(ytCluster)
					.where(eq(ytCluster.id, "cluster-states"));
				expect(row?.state).toBe(state);
			}
		});

		it("stores versionsAffected as JSON array", async () => {
			await db.insert(ytCluster).values({
				id: "cluster-versions",
				organizationId: "org-yt-1",
				title: "Version bug",
				versionsAffected: ["0.1.0", "0.2.0", "0.3.0"],
			});

			const [row] = await db
				.select()
				.from(ytCluster)
				.where(eq(ytCluster.id, "cluster-versions"));
			expect(row?.versionsAffected).toEqual(["0.1.0", "0.2.0", "0.3.0"]);
		});
	});

	describe("ytSignal", () => {
		beforeEach(async () => {
			await db.insert(ytFeed).values({
				id: "feed-s-1",
				organizationId: "org-yt-1",
				name: "Feed",
				gameTitle: "Game",
				searchQuery: "query",
			});
			await db.insert(ytVideo).values({
				id: "video-s-1",
				feedId: "feed-s-1",
				organizationId: "org-yt-1",
				youtubeVideoId: "sig123",
				title: "Signal Video",
			});
			await db.insert(ytTranscript).values({
				id: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				source: "youtube_captions",
			});
		});

		it("creates a signal with all fields", async () => {
			await db.insert(ytSignal).values({
				id: "signal-1",
				transcriptId: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				type: "bug",
				severity: "high",
				text: "Camera clips through wall when crouching",
				contextBefore: "I was trying to hide behind a box",
				contextAfter: "And then the camera just went through everything",
				timestampStart: 225,
				timestampEnd: 238,
				confidence: 92,
				component: "camera",
				gameVersion: "0.2.0",
			});

			const [row] = await db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-1"));
			expect(row?.type).toBe("bug");
			expect(row?.severity).toBe("high");
			expect(row?.confidence).toBe(92);
			expect(row?.vectorized).toBe(false);
		});

		it("defaults severity to medium and vectorized to false", async () => {
			await db.insert(ytSignal).values({
				id: "signal-defaults",
				transcriptId: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				type: "suggestion",
				text: "Would be nice to have a minimap",
			});

			const [row] = await db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-defaults"));
			expect(row?.severity).toBe("medium");
			expect(row?.vectorized).toBe(false);
		});

		it("can assign a signal to a cluster", async () => {
			await db.insert(ytCluster).values({
				id: "cluster-assign-1",
				organizationId: "org-yt-1",
				title: "Camera issues",
			});

			await db.insert(ytSignal).values({
				id: "signal-clustered",
				transcriptId: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				type: "bug",
				text: "Camera issue",
				clusterId: "cluster-assign-1",
			});

			const [row] = await db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-clustered"));
			expect(row?.clusterId).toBe("cluster-assign-1");
		});

		it("sets clusterId to null when cluster is deleted", async () => {
			await db.insert(ytCluster).values({
				id: "cluster-del-1",
				organizationId: "org-yt-1",
				title: "Deleted cluster",
			});

			await db.insert(ytSignal).values({
				id: "signal-orphan",
				transcriptId: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				type: "bug",
				text: "Orphaned signal",
				clusterId: "cluster-del-1",
			});

			await db.delete(ytCluster).where(eq(ytCluster.id, "cluster-del-1"));

			const [row] = await db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-orphan"));
			expect(row?.clusterId).toBeNull();
		});

		it("cascades delete when transcript is deleted", async () => {
			await db.insert(ytSignal).values({
				id: "signal-cascade-1",
				transcriptId: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				type: "other",
				text: "Will cascade",
			});

			await db
				.delete(ytTranscript)
				.where(eq(ytTranscript.id, "transcript-s-1"));
			const signals = await db.select().from(ytSignal);
			expect(signals).toHaveLength(0);
		});

		it("marks signals as vectorized", async () => {
			await db.insert(ytSignal).values({
				id: "signal-vec-1",
				transcriptId: "transcript-s-1",
				videoId: "video-s-1",
				organizationId: "org-yt-1",
				type: "bug",
				text: "vectorize me",
			});

			await db
				.update(ytSignal)
				.set({ vectorized: true, embeddingModel: "text-embedding-3-small" })
				.where(eq(ytSignal.id, "signal-vec-1"));

			const [row] = await db
				.select()
				.from(ytSignal)
				.where(eq(ytSignal.id, "signal-vec-1"));
			expect(row?.vectorized).toBe(true);
			expect(row?.embeddingModel).toBe("text-embedding-3-small");
		});
	});

	describe("clearTestDatabase", () => {
		it("clears all YouTube tables", async () => {
			await db.insert(ytFeed).values({
				id: "feed-clear-1",
				organizationId: "org-yt-1",
				name: "Clear Feed",
				gameTitle: "Game",
				searchQuery: "query",
			});

			clearTestDatabase(db);

			const feeds = await db.select().from(ytFeed);
			expect(feeds).toHaveLength(0);
		});
	});
});
