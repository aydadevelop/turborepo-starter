import { beforeEach, describe, expect, it, vi } from "vitest";

const { downloadAudio, downloadAudioOptionsSchema } = await import(
	"../download-audio"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUDIO_CDN_URL = "https://rr.googlevideo.com/videoplayback?id=abc123";

interface AdaptiveFormat {
	bitrate: number;
	contentLength?: string;
	itag: number;
	mimeType: string;
	signatureCipher?: string;
	url?: string;
}

function makePlayerResponse(
	adaptiveFormats: AdaptiveFormat[]
): Record<string, unknown> {
	return {
		streamingData: { adaptiveFormats },
	};
}

const FAKE_AUDIO = new Uint8Array([1, 2, 3, 4]).buffer;

function mockFetch(
	playerResponse: Record<string, unknown>,
	opts: { playerStatus?: number; audioStatus?: number } = {}
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
			// Audio CDN fetch
			const status = opts.audioStatus ?? 200;
			return Promise.resolve({
				ok: status < 400,
				status,
				arrayBuffer: () => Promise.resolve(FAKE_AUDIO),
			});
		})
	);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("downloadAudio", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("downloads m4a audio and returns Uint8Array with correct content type", async () => {
		mockFetch(
			makePlayerResponse([
				{
					itag: 140,
					url: AUDIO_CDN_URL,
					mimeType: 'audio/mp4; codecs="mp4a.40.2"',
					bitrate: 129_000,
					contentLength: "4",
				},
			])
		);

		const result = await downloadAudio({
			youtubeVideoId: "abc123",
			format: "m4a",
		});

		expect(result.data).toBeInstanceOf(Uint8Array);
		expect(result.data.length).toBe(4);
		expect(result.contentType).toBe("audio/mp4");
		expect(result.extension).toBe("m4a");
	});

	it("prefers audio/webm (opus) track when format is opus", async () => {
		mockFetch(
			makePlayerResponse([
				{
					itag: 140,
					url: AUDIO_CDN_URL,
					mimeType: 'audio/mp4; codecs="mp4a.40.2"',
					bitrate: 129_000,
					contentLength: "4",
				},
				{
					itag: 251,
					url: AUDIO_CDN_URL,
					mimeType: 'audio/webm; codecs="opus"',
					bitrate: 61_500,
					contentLength: "4",
				},
			])
		);

		const result = await downloadAudio({
			youtubeVideoId: "abc123",
			format: "opus",
		});

		expect(result.extension).toBe("opus");
		expect(result.contentType).toBe("audio/webm; codecs=opus");
	});

	it("falls back to first audio format when preferred type is unavailable", async () => {
		// Only webm available, requesting m4a → falls back
		mockFetch(
			makePlayerResponse([
				{
					itag: 251,
					url: AUDIO_CDN_URL,
					mimeType: 'audio/webm; codecs="opus"',
					bitrate: 61_500,
					contentLength: "4",
				},
			])
		);

		const result = await downloadAudio({
			youtubeVideoId: "abc123",
			format: "m4a",
		});

		expect(result.data).toBeInstanceOf(Uint8Array);
		expect(result.extension).toBe("opus");
	});

	it("throws when no direct audio formats are available", async () => {
		// Format has signatureCipher instead of url (shouldn't happen with InnerTube
		// ANDROID client, but guarding against it)
		mockFetch(
			makePlayerResponse([
				{
					itag: 140,
					signatureCipher: "s=ABC&sp=sig&url=https://...",
					mimeType: 'audio/mp4; codecs="mp4a.40.2"',
					bitrate: 129_000,
				},
			])
		);

		await expect(
			downloadAudio({ youtubeVideoId: "abc123", format: "m4a" })
		).rejects.toThrow("No directly accessible audio formats found");
	});

	it("throws on non-200 InnerTube player response", async () => {
		mockFetch({}, { playerStatus: 403 });

		await expect(
			downloadAudio({ youtubeVideoId: "abc123", format: "m4a" })
		).rejects.toThrow("YouTube InnerTube failed: 403");
	});

	it("throws when audio stream fetch fails", async () => {
		mockFetch(
			makePlayerResponse([
				{
					itag: 140,
					url: AUDIO_CDN_URL,
					mimeType: 'audio/mp4; codecs="mp4a.40.2"',
					bitrate: 129_000,
					contentLength: "4",
				},
			]),
			{ audioStatus: 403 }
		);

		await expect(
			downloadAudio({ youtubeVideoId: "abc123", format: "m4a" })
		).rejects.toThrow("Audio stream fetch failed: 403");
	});
});

describe("downloadAudioOptionsSchema", () => {
	it("validates and applies defaults", () => {
		const result = downloadAudioOptionsSchema.parse({
			youtubeVideoId: "abc123",
		});
		expect(result.format).toBe("m4a");
	});

	it("rejects empty youtubeVideoId", () => {
		expect(() =>
			downloadAudioOptionsSchema.parse({ youtubeVideoId: "" })
		).toThrow();
	});

	it("rejects invalid format", () => {
		expect(() =>
			downloadAudioOptionsSchema.parse({
				youtubeVideoId: "abc123",
				format: "flac",
			})
		).toThrow();
	});
});
