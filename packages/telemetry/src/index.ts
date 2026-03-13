import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ORPCInstrumentation } from "@orpc/otel";

export { httpInstrumentationMiddleware } from "@hono/otel";
export { prometheus } from "@hono/prometheus";
export { log } from "./logger";
export { tracingMiddleware } from "./tracing";

/**
 * Initialise the OpenTelemetry SDK.
 * Must be called (and awaited via sdk.start()) BEFORE any other imports
 * that touch HTTP clients, databases, or the Hono app.
 *
 * The OTLP endpoint is read from OTEL_EXPORTER_OTLP_ENDPOINT env var.
 * Default (Docker network): http://tempo:4318  (OTLP HTTP)
 *
 * Because Bun runs TypeScript natively, all error stack traces in spans
 * already reference original .ts source files with correct line numbers —
 * no source map processing required.
 */
export function initTelemetry(serviceName: string): NodeSDK {
	const sdk = new NodeSDK({
		resource: resourceFromAttributes({ "service.name": serviceName }),
		traceExporter: new OTLPTraceExporter(),
		instrumentations: [new ORPCInstrumentation()],
	});

	sdk.start();
	return sdk;
}
