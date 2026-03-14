import {
	context as otelContext,
	type Span,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import { os } from "@orpc/server";

const TRACER_NAME = "@my-app/telemetry/orpc";

/**
 * oRPC middleware that creates a child span for every procedure call.
 *
 * Adds:
 *  - span name:  "rpc {procedure.path}" (e.g. "rpc booking.create")
 *  - rpc.system:  "orpc"
 *  - rpc.method:  dotted procedure path
 *  - rpc.service: first segment (domain router name)
 *  - error details on the span if the handler throws
 *
 * Usage (in packages/api/src/index.ts):
 *   import { tracingMiddleware } from "@my-app/telemetry/tracing";
 *   export const publicProcedure = o.use(tracingMiddleware);
 */
export const tracingMiddleware = os.middleware(({ next, path }) => {
	const tracer = trace.getTracer(TRACER_NAME);
	const procedurePath = path.join(".");
	const spanName = `rpc ${procedurePath}`;

	// Rename the parent HTTP span from generic "POST /*" to include the procedure
	const parentSpan = trace.getSpan(otelContext.active());
	if (parentSpan) {
		parentSpan.updateName(`POST /rpc/${procedurePath}`);
		parentSpan.setAttribute("http.route", `/rpc/${procedurePath}`);
	}

	return tracer.startActiveSpan(
		spanName,
		{
			kind: SpanKind.INTERNAL,
			attributes: {
				"rpc.system": "orpc",
				"rpc.method": procedurePath,
				"rpc.service": path[0] ?? "unknown",
			},
		},
		async (span: Span) => {
			try {
				const result = await next();
				span.setStatus({ code: SpanStatusCode.OK });
				return result;
			} catch (error: unknown) {
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : String(error),
				});
				if (error instanceof Error) {
					span.recordException(error);
				}
				if (
					error &&
					typeof error === "object" &&
					"code" in error &&
					"status" in error
				) {
					const orpcErr = error as { code: string; status: number };
					span.setAttribute("rpc.grpc_status_code", orpcErr.code);
					span.setAttribute("error.type", orpcErr.code);
				}
				throw error;
			} finally {
				span.end();
			}
		}
	);
});
