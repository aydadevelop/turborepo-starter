import { configurePaymentWebhookAdaptersFromEnv } from "@my-app/api/payments/webhooks";
import { env } from "@my-app/env/server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { corsMiddleware } from "./middleware/cors";
import { authRoutes } from "./routes/auth";

import { healthRoutes } from "./routes/health";
import { paymentWebhookRoutes } from "./routes/payment-webhook";
import { rpcMiddleware } from "./rpc/handlers";

configurePaymentWebhookAdaptersFromEnv({
	CLOUDPAYMENTS_PUBLIC_ID: env.CLOUDPAYMENTS_PUBLIC_ID,
	CLOUDPAYMENTS_API_SECRET: env.CLOUDPAYMENTS_API_SECRET,
});

export const app = new Hono();

app.use(logger());
app.use("/*", corsMiddleware);

app.route("/", authRoutes);
app.route("/", paymentWebhookRoutes);
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
