// Must be the first import in index.ts — initialises the OTel SDK before
// any instrumented modules (Hono, DB clients, fetch) are loaded.
import { initTelemetry } from "@my-app/telemetry";

initTelemetry("assistant");
