import { context, type Span, trace } from "@opentelemetry/api";

/**
 * Structured JSON logger that auto-injects OpenTelemetry trace context.
 *
 * Every log line includes traceId + spanId from the active span,
 * enabling Loki → Tempo cross-linking via the derivedFields regex.
 *
 * Usage:
 *   import { log } from "@my-app/telemetry/logger";
 *   log.info("booking created", { bookingId: "123" });
 *   log.error("payment failed", { error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function getTraceContext(): {
	traceId: string | undefined;
	spanId: string | undefined;
} {
	const span: Span | undefined = trace.getSpan(context.active());
	if (!span) {
		return { traceId: undefined, spanId: undefined };
	}
	const ctx = span.spanContext();
	return { traceId: ctx.traceId, spanId: ctx.spanId };
}

function emit(
	level: LogLevel,
	msg: string,
	data?: Record<string, unknown>,
): void {
	const { traceId, spanId } = getTraceContext();
	const entry: Record<string, unknown> = {
		level,
		msg,
		ts: new Date().toISOString(),
		...(traceId ? { traceId } : {}),
		...(spanId ? { spanId } : {}),
		...data,
	};
	const line = JSON.stringify(entry);
	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		console.log(line);
	}
}

export const log = {
	debug: (msg: string, data?: Record<string, unknown>) =>
		emit("debug", msg, data),
	info: (msg: string, data?: Record<string, unknown>) =>
		emit("info", msg, data),
	warn: (msg: string, data?: Record<string, unknown>) =>
		emit("warn", msg, data),
	error: (msg: string, data?: Record<string, unknown>) =>
		emit("error", msg, data),
};
