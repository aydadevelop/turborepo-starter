import { ytNlpQueueMessageSchema } from "@my-app/api/contracts/youtube-queue";
import { db } from "@my-app/db";
import {
	ytSignal,
	ytSignalSeverityValues,
	ytSignalTypeValues,
	ytTranscript,
} from "@my-app/db/schema/youtube";
import { eq } from "drizzle-orm";

const MAX_RETRY_ATTEMPTS = 3;
const MIN_TRANSCRIPT_LENGTH = 20;
const MAX_EXTRACTED_SIGNALS = 12;
const CONTEXT_WINDOW = 180;
const SENTENCE_REGEX = /[^.!?\n]+[.!?]?/g;
const MMSS_REGEX = /\b(\d{1,2}):(\d{2})\b/;
const MINUTES_MENTION_REGEX = /\b(\d{1,3})\s?(?:minutes?|mins?)\b/i;
const HAS_LATIN_TEXT_REGEX = /[a-zA-Z]/;
const MAX_SIGNAL_TEXT_LENGTH = 500;
const MAX_CONTEXT_LENGTH = 200;
const MAX_COMPONENT_LENGTH = 120;

// ─── Types ───────────────────────────────────────────────────────────────────

type SignalType = (typeof ytSignalTypeValues)[number];
type SignalSeverity = (typeof ytSignalSeverityValues)[number];
const signalTypeSet = new Set<SignalType>(ytSignalTypeValues);
const signalSeveritySet = new Set<SignalSeverity>(ytSignalSeverityValues);

interface QueueProducer {
	send(
		message: unknown,
		options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	): Promise<void>;
}

export interface ExtractedSignal {
	component?: string;
	confidence: number;
	contextAfter?: string;
	contextBefore?: string;
	/** Character offset where this signal ends in the transcript */
	endOffset?: number;
	severity: SignalSeverity;
	/** Character offset where this signal starts in the transcript */
	startOffset?: number;
	text: string;
	timestampEnd?: number;
	timestampStart?: number;
	type: SignalType;
}

export type AnalyzeTranscriptFn = (text: string) => Promise<ExtractedSignal[]>;

export interface YtNlpDependencies {
	analyzeTranscript?: AnalyzeTranscriptFn;
	ytClusterQueue?: QueueProducer;
}

interface HeuristicRule {
	component?: string;
	confidence: number;
	severity: SignalSeverity;
	type: SignalType;
	weight: number;
	words: RegExp;
}

const heuristicRules: HeuristicRule[] = [
	{
		type: "crash",
		severity: "critical",
		component: "stability",
		confidence: 95,
		weight: 100,
		words:
			/\b(crash|crashes|crashed|freeze|freezes|frozen|hard\s?lock|hangs?)\b/i,
	},
	{
		type: "performance",
		severity: "high",
		component: "performance",
		confidence: 90,
		weight: 90,
		words: /\b(fps|frame\s?rate|lag|stutter|slowdown|drops?\s?to\s?\d+)\b/i,
	},
	{
		type: "bug",
		severity: "high",
		component: "gameplay",
		confidence: 88,
		weight: 85,
		words:
			/\b(bug|glitch|broken|clipping|clips?\s?through|missing\s?prompt|doesn'?t\s?work|stuck)\b/i,
	},
	{
		type: "ux_friction",
		severity: "medium",
		component: "ui",
		confidence: 80,
		weight: 70,
		words:
			/\b(confusing|confused|unclear|hard\s?to\s?find|awkward|friction|inventory|menu)\b/i,
	},
	{
		type: "suggestion",
		severity: "low",
		component: "design",
		confidence: 74,
		weight: 60,
		words: /\b(should|could|would\s?be\s?nice|i\s?suggest|add\s?a?n?)\b/i,
	},
	{
		type: "praise",
		severity: "info",
		component: "experience",
		confidence: 70,
		weight: 40,
		words:
			/\b(love|amazing|great|awesome|beautiful|fun|excellent|satisfying)\b/i,
	},
];

let hasWarnedAboutFallbackAnalyzer = false;

const fallbackSignalExtractor: AnalyzeTranscriptFn = (text: string) => {
	const extracted: ExtractedSignal[] = [];
	const segments = splitIntoSegments(text);

	for (const segment of segments) {
		if (extracted.length >= MAX_EXTRACTED_SIGNALS) {
			break;
		}

		const match = rankSegmentRule(segment.value);
		if (!match) {
			continue;
		}

		const timestampStart = parseTimestampHint(segment.value);
		const contextBeforeStart = Math.max(0, segment.start - CONTEXT_WINDOW);
		const contextAfterEnd = Math.min(text.length, segment.end + CONTEXT_WINDOW);

		extracted.push({
			type: match.type,
			severity: match.severity,
			text: segment.value.slice(0, 500),
			startOffset: segment.start,
			endOffset: segment.end,
			confidence: match.confidence,
			component: match.component,
			timestampStart,
			timestampEnd:
				timestampStart !== undefined
					? Math.round(timestampStart + 30)
					: undefined,
			contextBefore: text
				.slice(contextBeforeStart, segment.start)
				.trim()
				.slice(-200),
			contextAfter: text
				.slice(segment.end, contextAfterEnd)
				.trim()
				.slice(0, 200),
		});
	}

	if (extracted.length > 0) {
		return Promise.resolve(extracted);
	}

	const fallback = fallbackFromFirstMeaningfulSentence(text);
	return Promise.resolve(fallback ? [fallback] : []);
};

const resolveAnalyzeTranscript = (
	dependencies: YtNlpDependencies
): AnalyzeTranscriptFn => {
	if (dependencies.analyzeTranscript) {
		return dependencies.analyzeTranscript;
	}

	if (!hasWarnedAboutFallbackAnalyzer) {
		hasWarnedAboutFallbackAnalyzer = true;
		console.warn(
			"[yt-nlp] analyzeTranscript dependency not provided; using built-in heuristic analyzer"
		);
	}

	return fallbackSignalExtractor;
};

function normalizeExtractedSignal(
	signal: ExtractedSignal,
	transcriptLength: number
): ExtractedSignal | undefined {
	const text = signal.text?.trim().slice(0, MAX_SIGNAL_TEXT_LENGTH);
	if (!text) {
		return undefined;
	}

	const type: SignalType = signalTypeSet.has(signal.type)
		? signal.type
		: "other";

	const severity: SignalSeverity = signalSeveritySet.has(signal.severity)
		? signal.severity
		: "low";

	const confidence = Number.isFinite(signal.confidence)
		? Math.max(0, Math.min(100, Math.round(signal.confidence)))
		: 50;

	const startOffset =
		typeof signal.startOffset === "number" &&
		Number.isFinite(signal.startOffset)
			? Math.max(0, Math.min(transcriptLength, Math.floor(signal.startOffset)))
			: undefined;
	const endOffset =
		typeof signal.endOffset === "number" && Number.isFinite(signal.endOffset)
			? Math.max(0, Math.min(transcriptLength, Math.floor(signal.endOffset)))
			: undefined;

	const validOffsets =
		typeof startOffset === "number" &&
		typeof endOffset === "number" &&
		startOffset < endOffset;

	const timestampStart =
		typeof signal.timestampStart === "number" &&
		Number.isFinite(signal.timestampStart) &&
		signal.timestampStart >= 0
			? signal.timestampStart
			: undefined;
	const timestampEnd =
		typeof signal.timestampEnd === "number" &&
		Number.isFinite(signal.timestampEnd) &&
		signal.timestampEnd >= 0
			? signal.timestampEnd
			: undefined;

	const component = signal.component?.trim().slice(0, MAX_COMPONENT_LENGTH);
	const contextBefore = signal.contextBefore?.trim().slice(-MAX_CONTEXT_LENGTH);
	const contextAfter = signal.contextAfter?.trim().slice(0, MAX_CONTEXT_LENGTH);

	return {
		type,
		severity,
		text,
		confidence,
		startOffset: validOffsets ? startOffset : undefined,
		endOffset: validOffsets ? endOffset : undefined,
		timestampStart,
		timestampEnd:
			timestampStart !== undefined &&
			timestampEnd !== undefined &&
			timestampEnd < timestampStart
				? undefined
				: timestampEnd,
		component,
		contextBefore,
		contextAfter,
	};
}

function splitIntoSegments(
	text: string
): Array<{ end: number; start: number; value: string }> {
	const segments: Array<{ end: number; start: number; value: string }> = [];

	for (const match of text.matchAll(SENTENCE_REGEX)) {
		const raw = match[0] ?? "";
		const value = raw.trim();
		if (!value || value.length < 8) {
			continue;
		}

		const start = match.index ?? text.indexOf(raw);
		const end = Math.min(text.length, start + raw.length);
		segments.push({ start, end, value });
	}

	return segments;
}

function rankSegmentRule(segment: string): HeuristicRule | undefined {
	const matches = heuristicRules.filter((rule) => rule.words.test(segment));
	if (matches.length === 0) {
		return undefined;
	}

	matches.sort((a, b) => b.weight - a.weight);
	return matches[0];
}

function parseTimestampHint(segment: string): number | undefined {
	const mmss = segment.match(MMSS_REGEX);
	if (mmss) {
		const minutes = Number(mmss[1]);
		const seconds = Number(mmss[2]);
		if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
			return minutes * 60 + seconds;
		}
	}

	const minutesMention = segment.match(MINUTES_MENTION_REGEX);
	if (minutesMention) {
		const minutes = Number(minutesMention[1]);
		if (Number.isFinite(minutes)) {
			return minutes * 60;
		}
	}

	return undefined;
}

function fallbackFromFirstMeaningfulSentence(
	text: string
): ExtractedSignal | undefined {
	const firstMeaningful = splitIntoSegments(text).find((segment) =>
		HAS_LATIN_TEXT_REGEX.test(segment.value)
	);

	if (!firstMeaningful) {
		return undefined;
	}

	const contextBeforeStart = Math.max(
		0,
		firstMeaningful.start - CONTEXT_WINDOW
	);
	const contextAfterEnd = Math.min(
		text.length,
		firstMeaningful.end + CONTEXT_WINDOW
	);

	return {
		type: "other",
		severity: "low",
		text: firstMeaningful.value.slice(0, 500),
		startOffset: firstMeaningful.start,
		endOffset: firstMeaningful.end,
		confidence: 55,
		contextBefore: text.slice(contextBeforeStart, firstMeaningful.start).trim(),
		contextAfter: text.slice(firstMeaningful.end, contextAfterEnd).trim(),
	};
}

// ─── LLM-based extraction (production default) ──────────────────────────────

/**
 * Creates an LLM-powered transcript analyzer using AI SDK v6.
 *
 * Usage:
 *   import { generateText, Output } from "ai";
 *   import { createOpenRouter } from "@openrouter/ai-sdk-provider";
 *
 *   const openrouter = createOpenRouter({ apiKey });
 *   const analyzeTranscript = createLlmAnalyzer({
 *     model: openrouter("openai/gpt-4o-mini"),
 *     generateText,
 *     Output,
 *   });
 */
export function createLlmAnalyzer(deps: {
	model: unknown;
	generateText: (
		opts: unknown
	) => Promise<{ output: ExtractedSignal[] | undefined }>;
	Output: { object: (opts: unknown) => unknown };
}): AnalyzeTranscriptFn {
	const { model, generateText, Output } = deps;

	return async (text: string): Promise<ExtractedSignal[]> => {
		const { output } = await generateText({
			model,
			output: Output.object({
				schema: {
					type: "object",
					properties: {
						signals: {
							type: "array",
							items: {
								type: "object",
								properties: {
									type: {
										type: "string",
										enum: [
											"bug",
											"crash",
											"performance",
											"confusion",
											"ux_friction",
											"suggestion",
											"praise",
											"exploit",
											"other",
										],
									},
									severity: {
										type: "string",
										enum: ["critical", "high", "medium", "low", "info"],
									},
									text: { type: "string" },
									timestampStart: { type: "number" },
									timestampEnd: { type: "number" },
									contextBefore: { type: "string" },
									contextAfter: { type: "string" },
									confidence: { type: "number" },
									component: { type: "string" },
									startOffset: { type: "number" },
									endOffset: { type: "number" },
								},
								required: ["type", "severity", "text", "confidence"],
							},
						},
					},
					required: ["signals"],
				},
			}),
			prompt: buildExtractionPrompt(text),
		});

		if (!output) {
			return [];
		}

		const result = output as unknown as { signals: ExtractedSignal[] };
		return result.signals ?? [];
	};
}

function buildExtractionPrompt(transcript: string): string {
	return `You are an expert game QA analyst. Analyze this playtest transcript and extract ALL distinct feedback signals.

The transcript is provided below. For each signal you find, you MUST provide character offsets (startOffset, endOffset) pointing to the exact location in the transcript text. These offsets are 0-based character positions.

For each signal, provide:
- type: one of bug, crash, performance, confusion, ux_friction, suggestion, praise, exploit, other
- severity: one of critical (game-breaking), high (major issue), medium (notable), low (minor), info (positive/neutral)
- text: the relevant excerpt from the transcript (verbatim quote, max 500 chars)
- startOffset: 0-based character index where this quote starts in the transcript
- endOffset: 0-based character index where this quote ends in the transcript
- confidence: 0-100 how certain this is a real signal
- component: the game component affected (e.g. "camera", "inventory", "rendering", "docking", "audio", "controls", "graphics")
- timestampStart: time in seconds if mentioned in the text (e.g. "2:30" = 150, "5 minutes" = 300)
- timestampEnd: estimated end time in seconds (timestampStart + 30 if not specified)
- contextBefore: text immediately before this signal for context (up to 200 chars)
- contextAfter: text immediately after this signal for context (up to 200 chars)

Severity guidelines:
- Crashes, freezes, data loss → critical
- Bugs (clipping, missing prompts, broken features) → high
- Performance issues (fps drops, lag) → high
- Confusion, unclear UI → medium
- UX friction (annoying but workable) → medium
- Suggestions → low
- Praise → info

Extract EVERY distinct issue or piece of feedback. Do not merge different issues.

Transcript:
${transcript}`;
}

// ─── Message handler ─────────────────────────────────────────────────────────

const handleNlpMessage = async (
	queueMessage: Message,
	dependencies: YtNlpDependencies
) => {
	const parsed = ytNlpQueueMessageSchema.safeParse(queueMessage.body);
	if (!parsed.success) {
		console.error("[yt-nlp] Unknown message shape", queueMessage.body);
		queueMessage.ack();
		return;
	}

	const { transcriptId, videoId, organizationId } = parsed.data;

	try {
		const [transcript] = await db
			.select()
			.from(ytTranscript)
			.where(eq(ytTranscript.id, transcriptId))
			.limit(1);

		if (!transcript?.fullText) {
			console.warn(
				`[yt-nlp] Transcript ${transcriptId} not found or empty, skipping`
			);
			queueMessage.ack();
			return;
		}

		const { fullText } = transcript;

		if (fullText.trim().length < MIN_TRANSCRIPT_LENGTH) {
			console.log(
				`[yt-nlp] Transcript ${transcriptId} too short (${fullText.length} chars), skipping`
			);
			queueMessage.ack();
			return;
		}

		console.log(
			`[yt-nlp] Analyzing transcript ${transcriptId} (${fullText.length} chars)`
		);

		const analyzeTranscript = resolveAnalyzeTranscript(dependencies);
		const extractedRaw = await analyzeTranscript(fullText);
		const extracted = extractedRaw
			.map((signal) => normalizeExtractedSignal(signal, fullText.length))
			.filter((signal): signal is ExtractedSignal => signal !== undefined);

		if (extracted.length === 0) {
			console.warn(
				`[yt-nlp] No valid signals extracted from transcript ${transcriptId}`
			);
		}

		for (const signal of extracted) {
			try {
				const signalId = crypto.randomUUID();
				await db.insert(ytSignal).values({
					id: signalId,
					transcriptId,
					videoId,
					organizationId,
					type: signal.type,
					severity: signal.severity,
					text: signal.text,
					contextBefore: signal.contextBefore,
					contextAfter: signal.contextAfter,
					startOffset: signal.startOffset,
					endOffset: signal.endOffset,
					timestampStart: signal.timestampStart,
					timestampEnd: signal.timestampEnd,
					confidence: signal.confidence,
					component: signal.component,
				});

				if (dependencies.ytClusterQueue) {
					await dependencies.ytClusterQueue.send(
						{
							kind: "yt.cluster.v1" as const,
							signalId,
							organizationId,
						},
						{ contentType: "json" }
					);
				}
			} catch (signalError) {
				console.error(
					`[yt-nlp] Failed to persist signal for transcript ${transcriptId}`,
					signalError
				);
			}
		}

		console.log(
			`[yt-nlp] Extracted ${extracted.length} signals from transcript ${transcriptId}`
		);

		// Mark transcript as processed
		await db
			.update(ytTranscript)
			.set({ nlpStatus: "processed", markedAt: new Date() })
			.where(eq(ytTranscript.id, transcriptId));

		queueMessage.ack();
	} catch (error) {
		console.error(
			`[yt-nlp] Failed to analyze transcript ${transcriptId}:`,
			error
		);

		// Mark transcript as failed
		await db
			.update(ytTranscript)
			.set({ nlpStatus: "failed" })
			.where(eq(ytTranscript.id, transcriptId))
			.catch((e) => {
				console.error(
					`[yt-nlp] Failed to mark transcript ${transcriptId} as failed:`,
					e
				);
			});

		if (queueMessage.attempts < MAX_RETRY_ATTEMPTS) {
			queueMessage.retry({
				delaySeconds: Math.min(queueMessage.attempts * 60, 300),
			});
			return;
		}
		queueMessage.ack();
	}
};

export const processYtNlpBatch = async (
	batch: MessageBatch<unknown>,
	dependencies: YtNlpDependencies
) => {
	for (const queueMessage of batch.messages) {
		await handleNlpMessage(queueMessage, dependencies);
	}
};
