/**
 * Real-world transcription test using OpenRouter multimodal AI (Gemini 2.5 Flash).
 *
 * Sends audio as base64 `input_audio` content — returns transcript with
 * timestamps requested via prompt (no native timecode API like Whisper).
 *
 * Run: bun scripts/test-yt-transcribe-multimodal.ts
 */
import { existsSync, readFileSync } from "node:fs";

const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
	console.error("Missing OPEN_ROUTER_API_KEY in environment");
	process.exit(1);
}

const SAMPLE_PATH = "/tmp/yt-sample-30s.m4a";

if (!existsSync(SAMPLE_PATH)) {
	console.error(`Sample not found at ${SAMPLE_PATH}`);
	console.error(
		'Run: ffmpeg -i "<audio>" -t 30 -c copy /tmp/yt-sample-30s.m4a'
	);
	process.exit(1);
}

const bytes = readFileSync(SAMPLE_PATH);
const base64Audio = bytes.toString("base64");
console.log(
	`Audio: ${SAMPLE_PATH} (${(bytes.length / 1024).toFixed(0)}KB, base64: ${(base64Audio.length / 1024).toFixed(0)}KB)`
);

// ── OpenRouter chat completions with input_audio ───────────────────────────────

const MODEL = "google/gemini-2.5-flash";

console.log(`\nTranscribing via OpenRouter (${MODEL})...`);
const start = Date.now();

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
	method: "POST",
	headers: {
		Authorization: `Bearer ${OPENROUTER_API_KEY}`,
		"Content-Type": "application/json",
		"HTTP-Referer": "https://github.com/turborepo-alchemy",
		"X-Title": "turborepo-alchemy",
	},
	body: JSON.stringify({
		model: MODEL,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Transcribe this audio exactly as spoken. Format the output as timestamped segments like:\n[00:00] text here\n[00:05] more text\n\nProvide accurate timestamps for each sentence or phrase change.",
					},
					{
						type: "input_audio",
						input_audio: {
							data: base64Audio,
							format: "mp4",
						},
					},
				],
			},
		],
	}),
});

if (!response.ok) {
	const body = await response.text();
	console.error(`OpenRouter error ${response.status}:`, body);
	process.exit(1);
}

const data = (await response.json()) as {
	choices: Array<{ message: { content: string } }>;
	usage?: { prompt_tokens: number; completion_tokens: number };
};

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const text = data.choices[0]?.message?.content ?? "(no content)";

console.log(`\nDone in ${elapsed}s`);
if (data.usage) {
	console.log(
		`Tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion`
	);
}
console.log("\nTranscript with timecodes:\n");
console.log(text);
