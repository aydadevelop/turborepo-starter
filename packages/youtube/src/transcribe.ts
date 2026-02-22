import OpenAI, { type ClientOptions } from "openai";
import z from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const transcribeOptionsSchema = z.object({
	/** Whisper model to use */
	model: z.enum(["whisper-1"]).default("whisper-1"),
	/** Language hint (ISO-639-1) — improves accuracy and speed */
	language: z.string().optional(),
	/** Optional prompt to guide the model's style/vocabulary */
	prompt: z.string().optional(),
	/** MIME type of the audio buffer (default: audio/mp4) */
	contentType: z.string().default("audio/mp4"),
	/** File name hint for the Whisper API */
	fileName: z.string().default("audio.m4a"),
});

export type TranscribeOptions = z.infer<typeof transcribeOptionsSchema>;

export interface TranscribeResult {
	/** Audio duration in seconds */
	durationSeconds: number;
	/** Full transcribed text */
	fullText: string;
	/** Language detected or provided */
	language: string;
	/** The model used */
	model: string;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Transcribe an audio buffer using OpenAI Whisper.
 *
 * This function is transport-agnostic: pass in audio bytes from R2, disk, or
 * any other source. The download step is handled by `download-audio.ts`.
 */
export async function transcribeAudio(
	audioBuffer: ArrayBuffer | Uint8Array,
	options: TranscribeOptions,
	openaiOptions: ClientOptions
): Promise<TranscribeResult> {
	const audioFile = new File([new Uint8Array(audioBuffer)], options.fileName, {
		type: options.contentType,
	});

	const client = new OpenAI(openaiOptions);
	const response = await client.audio.transcriptions.create({
		file: audioFile,
		model: options.model ?? "whisper-1",
		language: options.language,
		prompt: options.prompt,
		response_format: "verbose_json",
	});

	const verbose = response as OpenAI.Audio.Transcription & {
		duration?: number;
		language?: string;
	};

	return {
		fullText: verbose.text,
		durationSeconds: verbose.duration ?? 0,
		language: verbose.language ?? options.language ?? "en",
		model: options.model ?? "whisper-1",
	};
}
