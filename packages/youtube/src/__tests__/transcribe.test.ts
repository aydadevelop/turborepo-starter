import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openai", () => {
	const create = vi.fn();
	return {
		default: vi.fn(() => ({
			audio: { transcriptions: { create } },
		})),
		__create: create,
	};
});

const { __create: createMock } = (await import("openai")) as unknown as {
	__create: ReturnType<typeof vi.fn>;
};

const { transcribeAudio, transcribeOptionsSchema } = await import(
	"../transcribe"
);

describe("transcribeAudio", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("transcribes audio buffer via Whisper API", async () => {
		createMock.mockResolvedValue({
			text: "This is the transcribed text from the game playtest",
			duration: 125.5,
			language: "en",
		});

		const audioBuffer = new ArrayBuffer(1024);
		const result = await transcribeAudio(
			audioBuffer,
			{ model: "whisper-1", contentType: "audio/mp4", fileName: "audio.m4a" },
			{ apiKey: "test-key" }
		);

		expect(result.fullText).toBe(
			"This is the transcribed text from the game playtest"
		);
		expect(result.durationSeconds).toBe(125.5);
		expect(result.language).toBe("en");
		expect(result.model).toBe("whisper-1");

		expect(createMock).toHaveBeenCalledTimes(1);
		const callArgs = createMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(callArgs?.model).toBe("whisper-1");
		expect(callArgs?.response_format).toBe("verbose_json");
	});

	it("uses provided language hint", async () => {
		createMock.mockResolvedValue({
			text: "Texto transcrito",
			duration: 60,
			language: "es",
		});

		const result = await transcribeAudio(
			new ArrayBuffer(512),
			{
				model: "whisper-1",
				language: "es",
				contentType: "audio/mp4",
				fileName: "audio.m4a",
			},
			{ apiKey: "test-key" }
		);

		expect(result.language).toBe("es");
		const callArgs = createMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(callArgs?.language).toBe("es");
	});

	it("handles missing duration in response", async () => {
		createMock.mockResolvedValue({
			text: "Some text",
		});

		const result = await transcribeAudio(
			new ArrayBuffer(256),
			{ model: "whisper-1", contentType: "audio/mp4", fileName: "audio.m4a" },
			{ apiKey: "test-key" }
		);

		expect(result.durationSeconds).toBe(0);
		expect(result.language).toBe("en");
	});

	it("accepts Uint8Array input", async () => {
		createMock.mockResolvedValue({
			text: "Uint8Array input",
			duration: 10,
			language: "en",
		});

		const uint8 = new Uint8Array([0, 1, 2, 3]);
		const result = await transcribeAudio(
			uint8,
			{ model: "whisper-1", contentType: "audio/mp4", fileName: "audio.m4a" },
			{ apiKey: "test-key" }
		);

		expect(result.fullText).toBe("Uint8Array input");
	});
});

describe("transcribeOptionsSchema", () => {
	it("validates and applies defaults", () => {
		const result = transcribeOptionsSchema.parse({});
		expect(result.model).toBe("whisper-1");
		expect(result.contentType).toBe("audio/mp4");
		expect(result.fileName).toBe("audio.m4a");
	});

	it("accepts optional language and prompt", () => {
		const result = transcribeOptionsSchema.parse({
			language: "ru",
			prompt: "Game playtest feedback",
		});
		expect(result.language).toBe("ru");
		expect(result.prompt).toBe("Game playtest feedback");
	});
});
