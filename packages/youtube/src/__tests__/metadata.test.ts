import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ytdlp-nodejs", () => {
	const getInfoAsync = vi.fn();
	return {
		YtDlp: vi.fn(() => ({ getInfoAsync })),
		__getInfoAsync: getInfoAsync,
	};
});

const { __getInfoAsync: getInfoAsyncMock } = (await import(
	"ytdlp-nodejs"
)) as unknown as {
	__getInfoAsync: ReturnType<typeof vi.fn>;
};

const { getVideoMetadata } = await import("../metadata");

describe("getVideoMetadata", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("parses full metadata from yt-dlp info", async () => {
		getInfoAsyncMock.mockResolvedValue({
			id: "abc123",
			title: "Game Playtest Feedback",
			channel: "GameDev Studio",
			channel_id: "UC123",
			description: "A detailed review",
			duration_string: "15:30",
			upload_date: "20260301",
			thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
			tags: ["playtest", "feedback", "gamedev"],
			view_count: 42_000,
		});

		const metadata = await getVideoMetadata("abc123");

		expect(metadata).toEqual({
			youtubeVideoId: "abc123",
			title: "Game Playtest Feedback",
			channelName: "GameDev Studio",
			channelId: "UC123",
			description: "A detailed review",
			duration: "15:30",
			publishedAt: "2026-03-01",
			thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
			tags: ["playtest", "feedback", "gamedev"],
			viewCount: 42_000,
		});
	});

	it("handles minimal metadata with missing fields", async () => {
		getInfoAsyncMock.mockResolvedValue({
			id: "min1",
			title: "Minimal Video",
		});

		const metadata = await getVideoMetadata("min1");

		expect(metadata.youtubeVideoId).toBe("min1");
		expect(metadata.title).toBe("Minimal Video");
		expect(metadata.channelName).toBeNull();
		expect(metadata.channelId).toBeNull();
		expect(metadata.description).toBeNull();
		expect(metadata.duration).toBeNull();
		expect(metadata.publishedAt).toBeNull();
		expect(metadata.thumbnailUrl).toBeNull();
		expect(metadata.tags).toEqual([]);
		expect(metadata.viewCount).toBeNull();
	});

	it("falls back to uploader when channel is missing", async () => {
		getInfoAsyncMock.mockResolvedValue({
			id: "up1",
			title: "Video",
			uploader: "Some Uploader",
		});

		const metadata = await getVideoMetadata("up1");
		expect(metadata.channelName).toBe("Some Uploader");
	});

	it("passes correct URL to yt-dlp", async () => {
		getInfoAsyncMock.mockResolvedValue({ id: "test1", title: "Test" });

		await getVideoMetadata("test1");

		expect(getInfoAsyncMock).toHaveBeenCalledWith(
			"https://www.youtube.com/watch?v=test1"
		);
	});
});
