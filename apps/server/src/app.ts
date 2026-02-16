import { configureCalendarAdaptersFromEnv } from "@full-stack-cf-app/api/calendar/adapters/configure";
import { configurePaymentWebhookAdaptersFromEnv } from "@full-stack-cf-app/api/payments/webhooks";
import { env } from "@full-stack-cf-app/env/server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { corsMiddleware } from "./middleware/cors";
import { authRoutes } from "./routes/auth";
import { calendarInternalRoutes } from "./routes/calendar-internal";
import { calendarWebhookRoutes } from "./routes/calendar-webhook";
import { healthRoutes } from "./routes/health";
import { paymentWebhookRoutes } from "./routes/payment-webhook";
import { rpcMiddleware } from "./rpc/handlers";

configureCalendarAdaptersFromEnv({
	GOOGLE_CALENDAR_CREDENTIALS_JSON: env.GOOGLE_CALENDAR_CREDENTIALS_JSON,
});

configurePaymentWebhookAdaptersFromEnv({
	CLOUDPAYMENTS_PUBLIC_ID: env.CLOUDPAYMENTS_PUBLIC_ID,
	CLOUDPAYMENTS_API_SECRET: env.CLOUDPAYMENTS_API_SECRET,
});

export const app = new Hono();

app.use(logger());
app.use("/*", corsMiddleware);

app.route("/", authRoutes);
app.route("/", calendarWebhookRoutes);
app.route("/", calendarInternalRoutes);
app.route("/", paymentWebhookRoutes);
app.use("/*", rpcMiddleware);
app.route("/", healthRoutes);

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
