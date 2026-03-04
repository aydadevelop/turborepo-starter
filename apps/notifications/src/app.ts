import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { corsMiddleware } from "./middleware/cors";
import { healthRoutes } from "./routes/health";

export const app = new Hono();

app.use(logger());
app.use("/*", corsMiddleware);
app.route("/health", healthRoutes);

app.notFound((c) => {
	return c.json({ error: "Not Found" }, 404);
});

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	console.error("Unhandled notifications app error", error);
	return c.json({ error: "Internal Server Error" }, 500);
});
