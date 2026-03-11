import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { registerServerIntegrations } from "./bootstrap";

import { corsMiddleware } from "./middleware/cors";
import { authRoutes } from "./routes/auth";
import { assetRoutes } from "./routes/assets";

import { healthRoutes } from "./routes/health";
import { paymentWebhookRoutes } from "./routes/payment-webhook";
import { supportEmailIntakeRoutes } from "./routes/support-email-intake";
import { rpcMiddleware } from "./rpc/handlers";

registerServerIntegrations();

export const app = new Hono();

app.use(logger());
app.use("/*", corsMiddleware);

app.route("/assets", assetRoutes);
app.route("/", authRoutes);
app.route("/", paymentWebhookRoutes);
app.route("/", supportEmailIntakeRoutes);
app.route("/health", healthRoutes);
app.use("/*", rpcMiddleware);

app.notFound((c) => {
	return c.json({ error: "Not Found" }, 404);
});

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		return error.getResponse();
	}

	console.error("Unhandled server error", error);
	return c.json({ error: "Internal Server Error" }, 500);
});
