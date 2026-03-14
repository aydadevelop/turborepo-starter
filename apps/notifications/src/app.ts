import {
	httpInstrumentationMiddleware,
	log,
	prometheus,
} from "@my-app/telemetry";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { corsMiddleware } from "./middleware/cors";
import { healthRoutes } from "./routes/health";

export const app = new Hono();

const { printMetrics, registerMetrics } = prometheus({
	collectDefaultMetrics: true,
});
app.use("*", registerMetrics);
app.get("/metrics", printMetrics);

const logRequest = async (
	c: Parameters<Parameters<typeof app.use>[1]>[0],
	next: () => Promise<void>
) => {
	const start = Date.now();
	await next();
	log.info(`${c.req.method} ${c.req.path}`, {
		method: c.req.method,
		path: c.req.path,
		status: c.res.status,
		duration: Date.now() - start,
	});
};
app.use((c, next) => {
	if (c.req.path === "/health" || c.req.method === "OPTIONS") {
		return next();
	}
	return logRequest(c, next);
});
app.use("*", httpInstrumentationMiddleware({ serviceName: "notifications" }));
app.use("/*", corsMiddleware);
app.route("/health", healthRoutes);

app.notFound((c) => {
	return c.json({ error: "Not Found" }, 404);
});

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	log.error("Unhandled notifications app error", {
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
	return c.json({ error: "Internal Server Error" }, 500);
});
