import { describe, expect, it } from "vitest";
import {
	createFeedInputSchema,
	getClusterInputSchema,
	listClustersInputSchema,
	listSignalsInputSchema,
	updateFeedInputSchema,
} from "../contracts/youtube";
import {
	ytClusterQueueMessageSchema,
	ytDiscoveryQueueMessageSchema,
	ytIngestQueueMessageSchema,
	ytNlpQueueMessageSchema,
	ytVectorizeQueueMessageSchema,
} from "../contracts/youtube-queue";
import { extractYoutubeVideoId } from "../routers/youtube/utils";

// ─── extractYoutubeVideoId ───────────────────────────────────────────────────

describe("extractYoutubeVideoId", () => {
	it("extracts from standard youtube.com URL", () => {
		expect(
			extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
		).toBe("dQw4w9WgXcQ");
	});

	it("extracts from youtube.com without www", () => {
		expect(extractYoutubeVideoId("https://youtube.com/watch?v=abc123")).toBe(
			"abc123"
		);
	});

	it("extracts from m.youtube.com", () => {
		expect(
			extractYoutubeVideoId("https://m.youtube.com/watch?v=mobileId")
		).toBe("mobileId");
	});

	it("extracts from youtu.be short URL", () => {
		expect(extractYoutubeVideoId("https://youtu.be/shortId")).toBe("shortId");
	});

	it("extracts from www.youtu.be short URL", () => {
		expect(extractYoutubeVideoId("https://www.youtu.be/shortId2")).toBe(
			"shortId2"
		);
	});

	it("handles youtube.com URL with extra params", () => {
		expect(
			extractYoutubeVideoId(
				"https://www.youtube.com/watch?v=test123&t=42&list=PLfoo"
			)
		).toBe("test123");
	});

	it("returns null for youtube.com without v param", () => {
		expect(
			extractYoutubeVideoId("https://www.youtube.com/watch?list=PLfoo")
		).toBeNull();
	});

	it("returns null for youtu.be with empty path", () => {
		expect(extractYoutubeVideoId("https://youtu.be/")).toBeNull();
	});

	it("returns null for unrelated domain", () => {
		expect(extractYoutubeVideoId("https://example.com/watch?v=abc")).toBeNull();
	});

	it("returns null for invalid URL", () => {
		expect(extractYoutubeVideoId("not-a-url")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractYoutubeVideoId("")).toBeNull();
	});
});

// ─── Queue Message Schemas ───────────────────────────────────────────────────

describe("ytDiscoveryQueueMessageSchema", () => {
	it("accepts valid payload", () => {
		const result = ytDiscoveryQueueMessageSchema.safeParse({
			kind: "yt.discovery.v1",
			feedId: "feed-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects wrong kind", () => {
		const result = ytDiscoveryQueueMessageSchema.safeParse({
			kind: "yt.ingest.v1",
			feedId: "feed-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects missing feedId", () => {
		const result = ytDiscoveryQueueMessageSchema.safeParse({
			kind: "yt.discovery.v1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty strings", () => {
		const result = ytDiscoveryQueueMessageSchema.safeParse({
			kind: "yt.discovery.v1",
			feedId: "  ",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});
});

describe("ytIngestQueueMessageSchema", () => {
	it("accepts valid payload with defaults", () => {
		const result = ytIngestQueueMessageSchema.safeParse({
			kind: "yt.ingest.v1",
			videoId: "vid-1",
			organizationId: "org-1",
			youtubeVideoId: "yt123",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.forceAsr).toBe(false);
		}
	});

	it("accepts explicit forceAsr", () => {
		const result = ytIngestQueueMessageSchema.safeParse({
			kind: "yt.ingest.v1",
			videoId: "vid-1",
			organizationId: "org-1",
			youtubeVideoId: "yt123",
			forceAsr: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.forceAsr).toBe(true);
		}
	});

	it("rejects missing youtubeVideoId", () => {
		const result = ytIngestQueueMessageSchema.safeParse({
			kind: "yt.ingest.v1",
			videoId: "vid-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});
});

describe("ytVectorizeQueueMessageSchema", () => {
	it("accepts valid payload", () => {
		const result = ytVectorizeQueueMessageSchema.safeParse({
			kind: "yt.vectorize.v1",
			transcriptId: "tx-1",
			videoId: "vid-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing transcriptId", () => {
		const result = ytVectorizeQueueMessageSchema.safeParse({
			kind: "yt.vectorize.v1",
			videoId: "vid-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});
});

describe("ytNlpQueueMessageSchema", () => {
	it("accepts valid payload", () => {
		const result = ytNlpQueueMessageSchema.safeParse({
			kind: "yt.nlp.v1",
			transcriptId: "tx-1",
			videoId: "vid-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects wrong kind", () => {
		const result = ytNlpQueueMessageSchema.safeParse({
			kind: "yt.vectorize.v1",
			transcriptId: "tx-1",
			videoId: "vid-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});
});

describe("ytClusterQueueMessageSchema", () => {
	it("accepts valid payload", () => {
		const result = ytClusterQueueMessageSchema.safeParse({
			kind: "yt.cluster.v1",
			signalId: "sig-1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing signalId", () => {
		const result = ytClusterQueueMessageSchema.safeParse({
			kind: "yt.cluster.v1",
			organizationId: "org-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty organizationId", () => {
		const result = ytClusterQueueMessageSchema.safeParse({
			kind: "yt.cluster.v1",
			signalId: "sig-1",
			organizationId: "",
		});
		expect(result.success).toBe(false);
	});
});

describe("getClusterInputSchema", () => {
	it("accepts a valid clusterId", () => {
		const result = getClusterInputSchema.safeParse({
			clusterId: "cluster-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects an empty clusterId", () => {
		const result = getClusterInputSchema.safeParse({
			clusterId: "   ",
		});
		expect(result.success).toBe(false);
	});
});

describe("listClustersInputSchema", () => {
	it("applies sorting and pagination defaults", () => {
		const result = listClustersInputSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.sortBy).toBe("impactScore");
			expect(result.data.sortDir).toBe("desc");
			expect(result.data.limit).toBe(20);
			expect(result.data.offset).toBe(0);
		}
	});

	it("rejects limit above max", () => {
		const result = listClustersInputSchema.safeParse({
			limit: 101,
		});
		expect(result.success).toBe(false);
	});
});

describe("createFeedInputSchema", () => {
	const base = {
		name: "Alpha Feed",
		gameTitle: "Starforge Arena",
	};

	it("accepts sourceMode=search", () => {
		const result = createFeedInputSchema.safeParse({
			...base,
			sourceMode: "search",
			searchQuery: "starforge playtest feedback",
		});
		expect(result.success).toBe(true);
	});

	it("accepts sourceMode=game_channel without searchQuery", () => {
		const result = createFeedInputSchema.safeParse({
			...base,
			sourceMode: "game_channel",
			scopeChannelId: "UC1234567890123456789012",
			scopeChannelName: "Official Channel",
		});
		expect(result.success).toBe(true);
	});

	it("accepts sourceMode=user_channel_query", () => {
		const result = createFeedInputSchema.safeParse({
			...base,
			sourceMode: "user_channel_query",
			scopeChannelId: "UC1234567890123456789012",
			scopeChannelName: "Creator Channel",
			searchQuery: "patch notes",
		});
		expect(result.success).toBe(true);
	});

	it("accepts sourceMode=playlist", () => {
		const result = createFeedInputSchema.safeParse({
			...base,
			sourceMode: "playlist",
			playlistId: "PL1234567890abcdefghijkl",
		});
		expect(result.success).toBe(true);
	});

	it("rejects sourceMode=search without searchQuery", () => {
		const result = createFeedInputSchema.safeParse({
			...base,
			sourceMode: "search",
		});
		expect(result.success).toBe(false);
	});

	it("rejects mixed mode fields", () => {
		const result = createFeedInputSchema.safeParse({
			...base,
			sourceMode: "search",
			searchQuery: "alpha",
			playlistId: "PL1234567890abcdefghijkl",
		});
		expect(result.success).toBe(false);
	});
});

describe("updateFeedInputSchema", () => {
	it("accepts switching to sourceMode=playlist", () => {
		const result = updateFeedInputSchema.safeParse({
			feedId: "feed-1",
			sourceMode: "playlist",
			playlistId: "PL1234567890abcdefghijkl",
			searchQuery: "",
			scopeChannelId: null,
			scopeChannelName: null,
		});
		expect(result.success).toBe(true);
	});

	it("rejects sourceMode=search update without searchQuery", () => {
		const result = updateFeedInputSchema.safeParse({
			feedId: "feed-1",
			sourceMode: "search",
		});
		expect(result.success).toBe(false);
	});

	it("accepts nullable stop-word fields", () => {
		const result = updateFeedInputSchema.safeParse({
			feedId: "feed-1",
			sourceMode: "search",
			searchQuery: "playtest",
			searchStopWords: null,
			titleStopWords: null,
		});
		expect(result.success).toBe(true);
	});
});

describe("listSignalsInputSchema", () => {
	it("accepts clustered filter", () => {
		const clustered = listSignalsInputSchema.safeParse({ clustered: true });
		const unclustered = listSignalsInputSchema.safeParse({ clustered: false });
		expect(clustered.success).toBe(true);
		expect(unclustered.success).toBe(true);
	});

	it("applies defaults and keeps clustered undefined when omitted", () => {
		const result = listSignalsInputSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.clustered).toBeUndefined();
			expect(result.data.sortBy).toBe("createdAt");
			expect(result.data.sortDir).toBe("desc");
			expect(result.data.limit).toBe(20);
			expect(result.data.offset).toBe(0);
		}
	});

	it("accepts clustered filter with additional list constraints", () => {
		const result = listSignalsInputSchema.safeParse({
			clustered: false,
			type: "bug",
			severity: "high",
			search: "stuck on loading",
			limit: 50,
			offset: 10,
		});
		expect(result.success).toBe(true);
	});
});
