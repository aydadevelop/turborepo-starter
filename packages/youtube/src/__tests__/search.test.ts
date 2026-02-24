import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchYouTube, searchOptionsSchema } = await import("../search");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeYtHtml(videoRenderers: Record<string, unknown>[]): string {
	const contents = videoRenderers.map((vr) => ({ videoRenderer: vr }));
	const ytInitialData = {
		contents: {
			twoColumnSearchResultsRenderer: {
				primaryContents: {
					sectionListRenderer: {
						contents: [{ itemSectionRenderer: { contents } }],
					},
				},
			},
		},
	};
	return `<html><body><script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script></body></html>`;
}

function mockFetch(html: string, status = 200) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: status >= 200 && status < 300,
			status,
			text: () => Promise.resolve(html),
		})
	);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("searchYouTube", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("parses videoRenderer entries from ytInitialData", async () => {
		mockFetch(
			makeYtHtml([
				{
					videoId: "abc123",
					title: { runs: [{ text: "Playtest Feedback - Game v0.9" }] },
					ownerText: {
						runs: [
							{
								text: "GameDev Studio",
								navigationEndpoint: {
									browseEndpoint: { browseId: "UC123" },
								},
							},
						],
					},
					thumbnail: {
						thumbnails: [
							{
								url: "https://i.ytimg.com/vi/abc123/default.jpg",
								width: 120,
								height: 90,
							},
							{
								url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
								width: 480,
								height: 360,
							},
						],
					},
					lengthText: { simpleText: "12:34" },
					viewCountText: { simpleText: "15,420 views" },
					descriptionSnippet: {
						runs: [{ text: "First impressions from the closed beta" }],
					},
					publishedTimeText: { simpleText: "1 month ago" },
				},
				{
					videoId: "def456",
					title: { runs: [{ text: "Bug Report Compilation" }] },
					ownerText: {
						runs: [
							{
								text: "QA Gamer",
								navigationEndpoint: {
									browseEndpoint: { browseId: "UC456" },
								},
							},
						],
					},
					thumbnail: {
						thumbnails: [
							{ url: "https://i.ytimg.com/vi/def456/maxresdefault.jpg" },
						],
					},
				},
			])
		);

		const results = await searchYouTube({
			query: "playtest feedback",
			maxResults: 5,
		});

		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			youtubeVideoId: "abc123",
			title: "Playtest Feedback - Game v0.9",
			channelName: "GameDev Studio",
			channelId: "UC123",
			description: "First impressions from the closed beta",
			duration: "12:34",
			publishedAt: "1 month ago",
			thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
			viewCount: 15_420,
		});
		expect(results[1]?.channelName).toBe("QA Gamer");
		expect(results[1]?.thumbnailUrl).toBe(
			"https://i.ytimg.com/vi/def456/maxresdefault.jpg"
		);
	});

	it("respects maxResults limit", async () => {
		const renderers = Array.from({ length: 20 }, (_, i) => ({
			videoId: `v${i}`,
			title: { runs: [{ text: `Video ${i}` }] },
		}));
		mockFetch(makeYtHtml(renderers));

		const results = await searchYouTube({ query: "test", maxResults: 5 });
		expect(results).toHaveLength(5);
	});

	it("returns [] when ytInitialData marker is absent", async () => {
		mockFetch("<html><body>no data here</body></html>");

		const results = await searchYouTube({ query: "test", maxResults: 10 });
		expect(results).toEqual([]);
	});

	it("returns [] on non-200 response", async () => {
		mockFetch("", 429);

		await expect(
			searchYouTube({ query: "test", maxResults: 10 })
		).rejects.toThrow("YouTube search failed: 429");
	});

	it("handles missing optional fields gracefully", async () => {
		mockFetch(
			makeYtHtml([{ videoId: "min1", title: { runs: [{ text: "Minimal" }] } }])
		);

		const results = await searchYouTube({ query: "minimal", maxResults: 1 });
		expect(results[0]).toEqual({
			youtubeVideoId: "min1",
			title: "Minimal",
			channelName: null,
			channelId: null,
			description: null,
			duration: null,
			publishedAt: null,
			thumbnailUrl: null,
			viewCount: null,
		});
	});

	it("sends request to correct YouTube search URL", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve(makeYtHtml([])),
		});
		vi.stubGlobal("fetch", fetchMock);

		await searchYouTube({ query: "hello world", maxResults: 10 });

		const firstCall = fetchMock.mock.calls[0];
		expect(firstCall).toBeDefined();
		const calledUrl = new URL(firstCall?.[0] as string);
		expect(calledUrl.origin).toBe("https://www.youtube.com");
		expect(calledUrl.pathname).toBe("/results");
		expect(calledUrl.searchParams.get("q")).toBe("hello world");
		expect(calledUrl.searchParams.get("hl")).toBe("en");
	});

	it("appends stop words as minus-prefixed tokens to query", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve(makeYtHtml([])),
		});
		vi.stubGlobal("fetch", fetchMock);

		await searchYouTube({
			query: "reanimal",
			maxResults: 5,
			stopWords: ["shorts", "clip"],
		});

		const firstCall = fetchMock.mock.calls[0];
		expect(firstCall).toBeDefined();
		const calledUrl = new URL(firstCall?.[0] as string);
		expect(calledUrl.searchParams.get("q")).toBe("reanimal -shorts -clip");
	});

	it("encodes medium duration filter as EgQQARgD sp param", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve(makeYtHtml([])),
		});
		vi.stubGlobal("fetch", fetchMock);

		await searchYouTube({ query: "test", maxResults: 5, duration: "medium" });

		const firstCall = fetchMock.mock.calls[0];
		expect(firstCall).toBeDefined();
		const calledUrl = new URL(firstCall?.[0] as string);
		expect(calledUrl.searchParams.get("sp")).toBe("EgQQARgD");
	});
});

describe("searchOptionsSchema", () => {
	it("validates valid inputs", () => {
		const result = searchOptionsSchema.parse({
			query: "playtest feedback bugs",
			maxResults: 10,
		});
		expect(result.query).toBe("playtest feedback bugs");
		expect(result.maxResults).toBe(10);
	});

	it("applies defaults", () => {
		const result = searchOptionsSchema.parse({ query: "test" });
		expect(result.maxResults).toBe(10);
	});

	it("rejects empty query", () => {
		expect(() => searchOptionsSchema.parse({ query: "" })).toThrow();
		expect(() => searchOptionsSchema.parse({ query: "   " })).toThrow();
	});

	it("rejects out-of-range maxResults", () => {
		expect(() =>
			searchOptionsSchema.parse({ query: "test", maxResults: 0 })
		).toThrow();
		expect(() =>
			searchOptionsSchema.parse({ query: "test", maxResults: 51 })
		).toThrow();
	});
});
