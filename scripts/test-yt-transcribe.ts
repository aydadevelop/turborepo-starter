/**
 * Real-world transcription test using OpenAI Whisper directly.
 *
 * Reuses the already-downloaded audio from scripts/test-yt-ytdlp.ts.
 * If the cached file is >2MB, trims to first 30s via ffmpeg.
 * If no cache found, downloads fresh via InnerTube.
 *
 * Run: bun scripts/test-yt-transcribe.ts
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { downloadAudio } from "../packages/youtube/src/download-audio";
import { transcribeAudio } from "../packages/youtube/src/transcribe";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
	console.error("Missing OPENAI_API_KEY in environment");
	process.exit(1);
}

const VIDEO_ID = "UjayV4GWkPc";
const CACHED_DIR = "/tmp/yt-ytdlp-audio";
const SAMPLE_PATH = "/tmp/yt-sample-30s.m4a";
// OpenRouter's Vercel gateway rejects payloads over ~4.5MB; 30s ≈ 1.1MB
const MAX_BYTES = 2 * 1024 * 1024;

// ── 1. Load or download audio ─────────────────────────────────────────────────

let audioBuffer: ArrayBuffer;
let contentType: string;
let fileName: string;

const cached = existsSync(CACHED_DIR)
	? readdirSync(CACHED_DIR).find(
			(f) => f.endsWith(".m4a") || f.endsWith(".mp4")
		)
	: null;

if (cached) {
	let filePath = join(CACHED_DIR, cached);
	const size = statSync(filePath).size;

	if (size > MAX_BYTES) {
		console.log(
			`Cached file is ${(size / 1024 / 1024).toFixed(1)}MB — trimming to 30s via ffmpeg...`
		);
		execSync(
			`ffmpeg -i "${filePath}" -t 30 -c copy "${SAMPLE_PATH}" -y 2>/dev/null`
		);
		filePath = SAMPLE_PATH;
		console.log(
			`Trimmed sample: ${(statSync(filePath).size / 1024).toFixed(0)}KB`
		);
	} else {
		console.log(`Using cached audio: ${filePath}`);
	}

	const bytes = readFileSync(filePath);
	audioBuffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength
	) as ArrayBuffer;
	contentType = filePath.endsWith(".mp4") ? "video/mp4" : "audio/mp4";
	fileName = filePath.endsWith(".mp4") ? "audio.mp4" : "audio.m4a";
} else {
	console.log(
		`No cached audio found — downloading via InnerTube (${VIDEO_ID})...`
	);
	const result = await downloadAudio({
		youtubeVideoId: VIDEO_ID,
		format: "m4a",
	});
	audioBuffer = result.data.buffer as ArrayBuffer;
	contentType = result.contentType;
	fileName = `audio.${result.extension}`;
	console.log(`Downloaded ${result.data.length} bytes (${contentType})`);
}

// ── 2. Transcribe via OpenAI Whisper ─────────────────────────────────────────

console.log("\nTranscribing...");
const start = Date.now();

const result = await transcribeAudio(
	audioBuffer,
	{
		model: "whisper-1",
		language: "en",
		contentType,
		fileName,
	},
	{
		apiKey: OPENAI_API_KEY,
		// baseURL defaults to https://api.openai.com/v1
	}
);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

// ── 3. Output ─────────────────────────────────────────────────────────────────

console.log(`\nDone in ${elapsed}s`);
console.log(`Language: ${result.language}`);
console.log(`Duration: ${result.durationSeconds}s`);
console.log(`Model: ${result.model}`);
console.log(`Segments: ${result.segments.length}`);
console.log("\nTranscript (first 800 chars):\n");
console.log(result.fullText.slice(0, 800));

if (result.segments.length > 0) {
	console.log("\nTimecoded segments (first 10):\n");
	for (const seg of result.segments.slice(0, 10)) {
		const ts = (s: number) => {
			const m = Math.floor(s / 60)
				.toString()
				.padStart(2, "0");
			const sec = (s % 60).toFixed(1).padStart(4, "0");
			return `${m}:${sec}`;
		};
		console.log(`  [${ts(seg.start)} → ${ts(seg.end)}] ${seg.text}`);
	}
}
