import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSubtitles, subtitleOptionsSchema } = await import("../subtitles");

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface CaptionTrack {
	baseUrl: string;
	kind?: string;
	languageCode: string;
}

function makePlayerResponse(tracks: CaptionTrack[]): Record<string, unknown> {
	return {
		captions: {
			playerCaptionsTracklistRenderer: { captionTracks: tracks },
		},
	};
}

const JSON3_EN = JSON.stringify({
	events: [{ segs: [{ utf8: "Hello " }] }, { segs: [{ utf8: "world" }] }],
});

const XML_EN =
	'<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><body><p t="0" d="1000">Hello world</p></body></timedtext>';

const CAPTION_URL = "https://youtube.com/api/timedtext?v=abc123&lang=en";

function mockFetch(
	playerResponse: Record<string, unknown>,
	captionBody: string,
	opts: { playerStatus?: number; captionStatus?: number } = {}
) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			// InnerTube player API (POST)
			if ((url as string).includes("youtubei/v1/player")) {
				const status = opts.playerStatus ?? 200;
				return Promise.resolve({
					ok: status < 400,
					status,
					json: () => Promise.resolve(playerResponse),
				});
			}
			// Caption fetch (GET)
			const status = opts.captionStatus ?? 200;
			return Promise.resolve({
				ok: status < 400,
				status,
				text: () => Promise.resolve(captionBody),
			});
		})
	);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getSubtitles", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("extracts manual captions (non-asr track)", async () => {
		mockFetch(
			makePlayerResponse([{ baseUrl: CAPTION_URL, languageCode: "en" }]),
			JSON3_EN
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["en"],
		});

		expect(results).toHaveLength(1);
		expect(results[0]?.source).toBe("youtube_captions");
		expect(results[0]?.fullText).toBe("Hello world");
		expect(results[0]?.language).toBe("en");
	});

	it("uses auto-generated (asr) track when no manual track exists", async () => {
		mockFetch(
			makePlayerResponse([
				{ baseUrl: CAPTION_URL, languageCode: "en", kind: "asr" },
			]),
			JSON3_EN
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["en"],
		});

		expect(results[0]?.source).toBe("auto_generated");
	});

	it("prefers manual track over asr when both exist", async () => {
		mockFetch(
			makePlayerResponse([
				{ baseUrl: CAPTION_URL, languageCode: "en", kind: "asr" },
				{ baseUrl: CAPTION_URL, languageCode: "en" },
			]),
			JSON3_EN
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["en"],
		});

		expect(results[0]?.source).toBe("youtube_captions");
	});

	it("returns empty array when no subtitles available for language", async () => {
		mockFetch(
			makePlayerResponse([{ baseUrl: CAPTION_URL, languageCode: "fr" }]),
			JSON3_EN
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["ja"],
		});

		expect(results).toHaveLength(0);
	});

	it("returns empty array when captionTracks is empty", async () => {
		mockFetch(
			{ captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } } },
			""
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["en"],
		});

		expect(results).toEqual([]);
	});

	it("throws on non-200 InnerTube player response", async () => {
		mockFetch({}, "", { playerStatus: 429 });

		await expect(
			getSubtitles({ youtubeVideoId: "abc123", languages: ["en"] })
		).rejects.toThrow("YouTube InnerTube failed: 429");
	});

	it("strips VTT tags from non-JSON caption body", async () => {
		mockFetch(
			makePlayerResponse([{ baseUrl: CAPTION_URL, languageCode: "en" }]),
			"1\n00:00:01,000 --> 00:00:05,000\n<b>Bold</b> text here\n\n"
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["en"],
		});

		expect(results[0]?.fullText).toContain("Bold");
		expect(results[0]?.fullText).not.toContain("<b>");
	});

	it("extracts text from XML timedtext format (InnerTube default)", async () => {
		mockFetch(
			makePlayerResponse([{ baseUrl: CAPTION_URL, languageCode: "en" }]),
			XML_EN
		);

		const results = await getSubtitles({
			youtubeVideoId: "abc123",
			languages: ["en"],
		});

		expect(results[0]?.fullText).toContain("Hello world");
		expect(results[0]?.fullText).not.toContain("<p");
	});

	it("fetches caption using the track baseUrl directly", async () => {
		const fetchMock = vi.fn().mockImplementation((_url: string) =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve(
						makePlayerResponse([{ baseUrl: CAPTION_URL, languageCode: "en" }])
					),
				text: () => Promise.resolve(JSON3_EN),
			})
		);
		vi.stubGlobal("fetch", fetchMock);

		await getSubtitles({ youtubeVideoId: "abc123", languages: ["en"] });

		const captionCall = fetchMock.mock.calls[1]?.[0] as string;
		expect(captionCall).toBe(CAPTION_URL);
	});
});

describe("subtitleOptionsSchema", () => {
	it("validates and applies defaults", () => {
		const result = subtitleOptionsSchema.parse({ youtubeVideoId: "abc123" });
		expect(result.languages).toEqual(["en"]);
		expect(result.autoGenerated).toBe(true);
	});

	it("rejects empty youtubeVideoId", () => {
		expect(() => subtitleOptionsSchema.parse({ youtubeVideoId: "" })).toThrow();
	});
});
