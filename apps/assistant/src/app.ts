import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { corsMiddleware } from "./middleware/cors";
import { healthRoutes } from "./routes/health";
import { rpcMiddleware } from "./rpc/handlers";

export const app = new Hono();

app.use(logger());
app.use("/*", corsMiddleware);

app.route("/health", healthRoutes);
app.use("/*", rpcMiddleware);

app.notFound((c) => {
	return c.json({ error: "Not Found" }, 404);
});
// Hono's default 404 handler returns an HTML page, so we override it to return JSON instead.
app.onError((error, c) => {
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	console.error("Unhandled assistant app error", error);
	return c.json({ error: "Internal Server Error" }, 500);
});
