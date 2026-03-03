/**
 * AI SDK Data Stream Protocol helpers.
 *
 * The Vercel AI SDK (v4+) uses a line-based text protocol where each line is
 * prefixed with a type code and a colon:
 *
 *   0:"text chunk"\n          — text delta
 *   9:{"toolCallId":...}\n    — tool call begin
 *   a:{"toolCallId":...}\n    — tool call delta (streaming args)
 *   b:{"toolCallId":...}\n    — tool result
 *   e:{"finishReason":...}\n  — finish message
 *   d:{"finishReason":...}\n  — finish step
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol#data-stream-protocol
 */

/** Encode a text delta chunk. */
export const textChunk = (text: string): string =>
	`0:${JSON.stringify(text)}\n`;

/** Encode a tool call invocation. */
export const toolCallChunk = (params: {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}): string =>
	`9:${JSON.stringify({
		toolCallId: params.toolCallId,
		toolName: params.toolName,
		args: params.args,
	})}\n`;

/** Encode a tool result. */
export const toolResultChunk = (params: {
	toolCallId: string;
	result: unknown;
}): string =>
	`b:${JSON.stringify({
		toolCallId: params.toolCallId,
		result: params.result,
	})}\n`;

/** Encode a finish-step marker. */
export const finishStepChunk = (
	finishReason: "stop" | "tool-calls" | "length" | "error" = "stop"
): string =>
	`d:${JSON.stringify({ finishReason })}\n`;

/** Encode a finish message marker. */
export const finishMessageChunk = (
	finishReason: "stop" | "tool-calls" | "length" | "error" = "stop"
): string =>
	`e:${JSON.stringify({ finishReason })}\n`;

/**
 * Build a complete text-only stream response body.
 *
 * @example
 * ```ts
 * const body = buildTextStream("Hello, how can I help?");
 * await mockChatStream(page, body);
 * ```
 */
export const buildTextStream = (text: string): string =>
	[textChunk(text), finishStepChunk("stop"), finishMessageChunk("stop")].join(
		""
	);

/**
 * Build a stream that invokes a tool and returns a result.
 *
 * @example
 * ```ts
 * const body = buildToolCallStream({
 *   toolCallId: "tc_1",
 *   toolName: "get_weather",
 *   args: { city: "Berlin" },
 *   result: { temp: 20, unit: "C" },
 *   followUpText: "It's 20°C in Berlin.",
 * });
 * ```
 */
export const buildToolCallStream = (params: {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	result: unknown;
	followUpText?: string;
}): string => {
	const chunks = [
		toolCallChunk({
			toolCallId: params.toolCallId,
			toolName: params.toolName,
			args: params.args,
		}),
		finishStepChunk("tool-calls"),
		toolResultChunk({
			toolCallId: params.toolCallId,
			result: params.result,
		}),
	];

	if (params.followUpText) {
		chunks.push(textChunk(params.followUpText));
	}

	chunks.push(finishStepChunk("stop"), finishMessageChunk("stop"));
	return chunks.join("");
};
