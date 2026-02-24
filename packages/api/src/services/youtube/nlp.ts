import { db } from "@my-app/db";
import {
	ytFeed,
	ytSignal,
	ytSignalSeverityValues,
	ytSignalTypeValues,
	ytTranscript,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { eq } from "drizzle-orm";
import z from "zod";
import {
	type QueueProducer,
	type YtNlpQueueMessage,
	ytQueueKinds,
} from "../../contracts/youtube-queue";

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

export interface ExtractedSignal {
	component?: string;
	confidence: number;
	contextAfter?: string;
	contextBefore?: string;
	/** Character offset where this signal ends in the transcript */
	endOffset?: number;
	/** Short reasoning why this qualifies as game feedback (max 150 chars) */
	reasoning?: string;
	severity: SignalSeverity;
	/** Numeric severity 0-10 from model (used for impact calculation) */
	severityScore?: number;
	/** Character offset where this signal starts in the transcript */
	startOffset?: number;
	/** Extracted tags for this signal */
	tags?: string[];
	text: string;
	timestampEnd?: number;
	timestampStart?: number;
	type: SignalType;
}

export interface TimedSegment {
	/** End time in seconds */
	end: number;
	/** Start time in seconds */
	start: number;
	/** Segment text content */
	text: string;
}

export type AnalyzeTranscriptFn = (
	text: string,
	timedSegments?: TimedSegment[],
	collectCategories?: string[]
) => Promise<ExtractedSignal[]>;

export interface YtNlpDependencies {
	analyzeTranscript?: AnalyzeTranscriptFn;
	ytVectorizeQueue?: QueueProducer;
}

interface HeuristicRule {
	component?: string;
	confidence: number;
	severity: SignalSeverity;
	severityScore: number;
	type: SignalType;
	weight: number;
	words: RegExp;
}

const heuristicRules: HeuristicRule[] = [
	{
		type: "crash",
		severity: "critical",
		severityScore: 10,
		component: "stability",
		confidence: 95,
		weight: 100,
		words:
			/\b(crash|crashes|crashed|freeze|freezes|frozen|hard\s?lock|hangs?)\b/i,
	},
	{
		type: "performance",
		severity: "high",
		severityScore: 8,
		component: "performance",
		confidence: 90,
		weight: 90,
		words: /\b(fps|frame\s?rate|lag|stutter|slowdown|drops?\s?to\s?\d+)\b/i,
	},
	{
		type: "bug",
		severity: "high",
		severityScore: 8,
		component: "gameplay",
		confidence: 88,
		weight: 85,
		words:
			/\b(bug|glitch|broken|clipping|clips?\s?through|missing\s?prompt|doesn'?t\s?work|stuck)\b/i,
	},
	{
		type: "ux_friction",
		severity: "medium",
		severityScore: 5,
		component: "ui",
		confidence: 80,
		weight: 70,
		words:
			/\b(confusing|confused|unclear|hard\s?to\s?find|awkward|friction|inventory|menu)\b/i,
	},
	{
		type: "suggestion",
		severity: "low",
		severityScore: 3,
		component: "design",
		confidence: 74,
		weight: 60,
		words: /\b(should|could|would\s?be\s?nice|i\s?suggest|add\s?a?n?)\b/i,
	},
	{
		type: "praise",
		severity: "info",
		severityScore: 1,
		component: "experience",
		confidence: 70,
		weight: 40,
		words:
			/\b(love|amazing|great|awesome|beautiful|fun|excellent|satisfying)\b/i,
	},
];

let hasWarnedAboutFallbackAnalyzer = false;

/**
 * Resolve a video timestamp (seconds) from a character offset using timed segments.
 * Finds the timed segment whose cumulative character range overlaps the given offset.
 */
export function resolveTimestampFromSegments(
	charOffset: number,
	_fullText: string,
	timedSegments: TimedSegment[]
): number | undefined {
	if (timedSegments.length === 0) {
		return undefined;
	}

	// Build a char-position → segment index mapping
	let charPos = 0;
	for (const seg of timedSegments) {
		const segEnd = charPos + seg.text.length;
		if (charOffset >= charPos && charOffset < segEnd) {
			// Interpolate within segment
			const ratio =
				seg.text.length > 0 ? (charOffset - charPos) / seg.text.length : 0;
			return Math.round(seg.start + ratio * (seg.end - seg.start));
		}
		// Account for space/newline between segments
		charPos = segEnd + 1;
	}

	// If offset is past all segments, return start of last segment
	return timedSegments.at(-1)?.start;
}

const fallbackSignalExtractor: AnalyzeTranscriptFn = (
	text: string,
	timedSegments?: TimedSegment[],
	collectCategories?: string[]
) => {
	const enabledTypes = collectCategories ? new Set(collectCategories) : null;
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

		// Skip types not in the enabled set
		if (enabledTypes && !enabledTypes.has(match.type)) {
			continue;
		}

		// Resolve timestamps: prefer timed segments mapping, fall back to text hints
		const timestampStart = timedSegments?.length
			? resolveTimestampFromSegments(segment.start, text, timedSegments)
			: parseTimestampHint(segment.value);
		let timestampEnd: number | undefined;

		if (timestampStart !== undefined && timedSegments?.length) {
			timestampEnd = resolveTimestampFromSegments(
				segment.end,
				text,
				timedSegments
			);
		} else if (timestampStart !== undefined) {
			timestampEnd = Math.round(timestampStart + 30);
		}

		const contextBeforeStart = Math.max(0, segment.start - CONTEXT_WINDOW);
		const contextAfterEnd = Math.min(text.length, segment.end + CONTEXT_WINDOW);

		// Derive tags from the match type and component
		const tags: string[] = [match.type];
		if (match.component) {
			tags.push(match.component);
		}

		extracted.push({
			type: match.type,
			severity: match.severity,
			severityScore: match.severityScore,
			reasoning: `Heuristic: matched ${match.type} keyword pattern`,
			text: segment.value.slice(0, 500),
			startOffset: segment.start,
			endOffset: segment.end,
			confidence: match.confidence,
			component: match.component,
			tags,
			timestampStart,
			timestampEnd,
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

function clampInt(
	value: unknown,
	min: number,
	max: number
): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	return Math.max(min, Math.min(max, Math.round(value)));
}

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

	const confidence = clampInt(signal.confidence, 0, 100) ?? 50;
	const severityScore = clampInt(signal.severityScore, 0, 10);

	const startOffset = clampInt(signal.startOffset, 0, transcriptLength);
	const endOffset = clampInt(signal.endOffset, 0, transcriptLength);

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
	const reasoning = signal.reasoning?.trim().slice(0, 150) || undefined;

	// Normalize tags: deduplicate, trim, lowercase, limit to 20
	const tags = signal.tags
		? [
				...new Set(
					signal.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
				),
			].slice(0, 20)
		: undefined;

	return {
		type,
		severity,
		severityScore,
		reasoning,
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
		tags,
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

/** Zod schema for a single extracted signal from LLM output. */
const llmSignalSchema = z.object({
	type: z.enum([
		"bug",
		"crash",
		"performance",
		"confusion",
		"ux_friction",
		"suggestion",
		"praise",
		"exploit",
		"other",
	]),
	severity: z.enum(["critical", "high", "medium", "low", "info"]),
	/** Numeric severity 0-10 for impact calculation */
	severityScore: z.number().int().min(0).max(10),
	/** Brief justification why this is genuine game feedback (max 150 chars) */
	reasoning: z.string().max(150),
	text: z.string(),
	/** Video timestamp in seconds where the signal starts */
	timestampStart: z.number().optional(),
	/** Video timestamp in seconds where the signal ends */
	timestampEnd: z.number().optional(),
	contextBefore: z.string().optional(),
	contextAfter: z.string().optional(),
	confidence: z.number(),
	component: z.string().optional(),
	startOffset: z.number().optional(),
	endOffset: z.number().optional(),
	tags: z.array(z.string()).optional(),
});

const llmOutputSchema = z.object({
	signals: z.array(llmSignalSchema),
});

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
	) => Promise<{ output: z.infer<typeof llmOutputSchema> | undefined }>;
	Output: { object: (opts: { schema: z.ZodType }) => unknown };
}): AnalyzeTranscriptFn {
	const { model, generateText, Output } = deps;

	return async (
		text: string,
		timedSegments?: TimedSegment[],
		collectCategories?: string[]
	): Promise<ExtractedSignal[]> => {
		const { output } = await generateText({
			model,
			output: Output.object({ schema: llmOutputSchema }),
			prompt: buildExtractionPrompt(text, timedSegments, collectCategories),
		});

		if (!output) {
			return [];
		}

		return output.signals ?? [];
	};
}

function formatTimedTranscript(timedSegments: TimedSegment[]): string {
	return timedSegments
		.map((seg) => {
			const startMin = Math.floor(seg.start / 60);
			const startSec = Math.floor(seg.start % 60);
			const endMin = Math.floor(seg.end / 60);
			const endSec = Math.floor(seg.end % 60);
			const ts = `${String(startMin).padStart(2, "0")}:${String(startSec).padStart(2, "0")}-${String(endMin).padStart(2, "0")}:${String(endSec).padStart(2, "0")}`;
			return `[${ts}] ${seg.text}`;
		})
		.join("\n");
}

function buildExtractionPrompt(
	transcript: string,
	timedSegments?: TimedSegment[],
	collectCategories?: string[]
): string {
	const hasTimedSegments = timedSegments && timedSegments.length > 0;
	const transcriptBlock = hasTimedSegments
		? `Timed Transcript (with video timestamps MM:SS-MM:SS):\n${formatTimedTranscript(timedSegments)}`
		: `Transcript:\n${transcript}`;

	// Build the allowed types list based on enabled categories
	const allTypes = [
		"bug",
		"crash",
		"performance",
		"confusion",
		"ux_friction",
		"suggestion",
		"praise",
		"exploit",
		"other",
	];
	const allowedTypes =
		collectCategories && collectCategories.length > 0
			? [...collectCategories, "other"]
			: allTypes;
	const typesLine = allowedTypes.join(", ");

	return `You are an expert video-game QA analyst. Your task is to extract actionable development feedback from a YouTube gameplay transcript.

GOAL: Identify moments where the player describes REAL ISSUES WITH THE GAME ITSELF — bugs, crashes, performance problems, confusing UI, and improvement suggestions directed at the developers. This data feeds into a bug-tracking pipeline, so each signal must be a distinct, actionable item a development team could triage.

CRITICAL DISTINCTION — in-game actions vs. game feedback:
Players narrate their gameplay. Sentences like "I should equip this sword" or "maybe I should go left" are IN-GAME DECISIONS, not feedback. Only extract signals where the player is commenting on the GAME'S QUALITY, DESIGN, or TECHNICAL STATE.

═══ ALLOWED SIGNAL TYPES (ONLY extract these): ${typesLine} ═══

Type definitions and examples:

bug — A software defect: something broken, glitchy, or behaving incorrectly.
  ✅ "My character clipped through the wall" / "The quest marker is pointing to the wrong location"
  ❌ "I died because I fell off the ledge" (gameplay outcome, not a defect)

crash — The game froze, crashed to desktop, hard-locked, or became unresponsive.
  ✅ "The game just crashed on me" / "It froze and I had to force-quit"
  ❌ "My game is running slow" (that's performance, not crash)

performance — FPS drops, stuttering, long load times, lag, rubber-banding.
  ✅ "I'm getting like 15 fps here" / "Huge frame drop when I open the inventory"
  ❌ "This level is hard" (difficulty, not performance)

confusion — The player is genuinely confused by game design, unclear instructions, or missing feedback.
  ✅ "I have no idea what this icon means" / "Where am I supposed to go? Nothing tells me"
  ❌ "Hmm, I wonder what's behind that door" (curiosity, not confusion about the game's design)

ux_friction — A usable but annoying/clunky interface or workflow.
  ✅ "Why do I have to click three times to sell one item" / "The font is way too small"
  ❌ "I keep forgetting to save" (user habit, not UX issue)

suggestion — The player proposes a change or feature TO THE DEVELOPERS.
  ✅ "They should add a sort-by-type button to the inventory" / "It would be nice if there was a mini-map"
  ❌ "I should use the fire spell here" / "Maybe I should craft a potion" (in-game strategy, NOT a game suggestion)

praise — Genuine positive feedback about game quality, design, art, or feel.
  ✅ "This art style is absolutely gorgeous" / "The combat feels so satisfying"
  ❌ "Nice, I got a legendary drop!" (excitement about gameplay outcome, not praising the game)

exploit — An unintended mechanic abuse, cheat, or balance-breaking interaction.
  ✅ "You can duplicate items by dropping and picking up at the same time" / "This build is completely broken, nothing can kill you"
  ❌ "I found a hidden chest" (intended secret, not exploit)

other — Feedback that doesn't fit the above but is clearly about game quality.

═══ OUTPUT FORMAT ═══

For each signal provide ALL of these fields:

- type: one of ${typesLine}
- severity: one of critical, high, medium, low, info (label for display)
- severityScore: integer 0-10 (MUST follow this calibration exactly):
    0 = no real issue, negligible
    1 = positive feedback (praise) or trivial cosmetic note
    2-3 = small annoyance or minor suggestion, no gameplay impact
    4-5 = noticeable issue, mild impact on experience
    6-7 = recurring or significant issue, clearly impacts experience
    8-9 = severe disruption — major bug, bad performance, or broken flow
    10 = critical failure — crash, data loss, hard-lock, game unplayable
- reasoning: 1-2 sentence justification (max 150 chars) why this qualifies as game feedback, not in-game narration
- text: verbatim quote from the transcript (max 500 chars)
- confidence: 0-100 how certain this is genuine game feedback (not in-game narration)
- component: game area affected (e.g. "camera", "inventory", "rendering", "audio", "controls", "ui", "network", "combat", "ai")
${hasTimedSegments ? "- timestampStart: start time as a NUMBER in seconds (e.g. 125.5 for 2:05.5)\n- timestampEnd: end time as a NUMBER in seconds" : "- startOffset: 0-based character index where quote starts\n- endOffset: 0-based character index where quote ends"}
- contextBefore: text before this signal (up to 200 chars)
- contextAfter: text after this signal (up to 200 chars)
- tags: array of descriptive keywords for grouping (include type + component + specific terms)

═══ RULES ═══
1. Each signal must be a DISTINCT issue — do not merge different problems.
2. Skip in-game narration, strategy talk, and reactions to gameplay outcomes.
3. When unsure if something is feedback or gameplay narration, set confidence < 50.
4. Timestamps must be NUMBERS in seconds, not strings.
5. severityScore must be an integer 0-10.

${transcriptBlock}`;
}

export type ProcessYtNlpMessageResult =
	| "processed"
	| "skipped_missing_or_empty_transcript"
	| "skipped_short_transcript";

export interface ProcessYtNlpMessageOptions {
	dependencies: YtNlpDependencies;
	message: YtNlpQueueMessage;
}

async function loadCollectCategories(
	message: YtNlpQueueMessage
): Promise<string[] | undefined> {
	if (message.collectCategories) {
		return message.collectCategories;
	}

	const [video] = await db
		.select({ feedId: ytVideo.feedId })
		.from(ytVideo)
		.where(eq(ytVideo.id, message.videoId))
		.limit(1);

	if (!video) {
		return undefined;
	}

	const [feed] = await db
		.select({ collectCategories: ytFeed.collectCategories })
		.from(ytFeed)
		.where(eq(ytFeed.id, video.feedId))
		.limit(1);

	if (feed?.collectCategories && Array.isArray(feed.collectCategories)) {
		return feed.collectCategories as string[];
	}

	return undefined;
}

export const processYtNlpMessage = async ({
	message,
	dependencies,
}: ProcessYtNlpMessageOptions): Promise<ProcessYtNlpMessageResult> => {
	const { transcriptId, videoId, organizationId } = message;

	try {
		const collectCategories = await loadCollectCategories(message);

		const [transcript] = await db
			.select()
			.from(ytTranscript)
			.where(eq(ytTranscript.id, transcriptId))
			.limit(1);

		if (!transcript?.fullText) {
			return "skipped_missing_or_empty_transcript";
		}

		const { fullText } = transcript;

		if (fullText.trim().length < MIN_TRANSCRIPT_LENGTH) {
			return "skipped_short_transcript";
		}

		console.log(
			`[yt-nlp] Analyzing transcript ${transcriptId} (${fullText.length} chars)`
		);

		const timedSegments = (transcript.timedSegments ?? []) as TimedSegment[];

		const analyzeTranscript = resolveAnalyzeTranscript(dependencies);
		const extractedRaw = await analyzeTranscript(
			fullText,
			timedSegments,
			collectCategories
		);

		// Post-process: resolve timestamps from timed segments if not set by analyzer
		for (const signal of extractedRaw) {
			if (
				timedSegments.length > 0 &&
				signal.timestampStart == null &&
				signal.startOffset != null
			) {
				signal.timestampStart = resolveTimestampFromSegments(
					signal.startOffset,
					fullText,
					timedSegments
				);
			}
			if (
				timedSegments.length > 0 &&
				signal.timestampEnd == null &&
				signal.endOffset != null
			) {
				signal.timestampEnd = resolveTimestampFromSegments(
					signal.endOffset,
					fullText,
					timedSegments
				);
			}
		}

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
					severityScore: signal.severityScore,
					reasoning: signal.reasoning,
					text: signal.text,
					contextBefore: signal.contextBefore,
					contextAfter: signal.contextAfter,
					startOffset: signal.startOffset,
					endOffset: signal.endOffset,
					timestampStart: signal.timestampStart,
					timestampEnd: signal.timestampEnd,
					confidence: signal.confidence,
					component: signal.component,
					tags: signal.tags ?? null,
				});

				// Vectorize queue is dispatched after ALL signals are persisted (below)
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

		// Dispatch to vectorize after all signals are persisted.
		// Pipeline: NLP → Vectorize → Cluster (sequential)
		if (dependencies.ytVectorizeQueue && extracted.length > 0) {
			await dependencies.ytVectorizeQueue.send(
				{
					kind: ytQueueKinds.vectorize,
					transcriptId,
					videoId,
					organizationId,
				},
				{ contentType: "json" }
			);
		}

		// Mark transcript as processed
		await db
			.update(ytTranscript)
			.set({ nlpStatus: "processed", markedAt: new Date() })
			.where(eq(ytTranscript.id, transcriptId));

		return "processed";
	} catch (error) {
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

		throw error;
	}
};
