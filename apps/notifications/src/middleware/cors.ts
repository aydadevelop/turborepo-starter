import { env } from "@my-app/env/server";
import { cors } from "hono/cors";

const parseCorsOrigins = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);

if (corsOrigins.length === 0) {
	throw new Error(
		"CORS_ORIGIN is required. Provide a comma-separated list of allowed origins."
	);
}

export const corsMiddleware = cors({
	origin: corsOrigins,
	allowMethods: ["GET", "POST", "OPTIONS"],
	allowHeaders: [
		"Content-Type",
		"Authorization",
		"Accept",
		"X-Requested-With",
		"X-ORPC-Source",
		"X-ORPC-Method",
		"X-ORPC-Last-Event-Id",
	],
	credentials: true,
});
