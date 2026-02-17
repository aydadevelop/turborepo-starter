import {
	listGoogleDeadLetters,
	renewGoogleWatches,
	retryFailedGoogleSyncs,
	startGoogleWatch,
	stopGoogleWatch,
	syncGoogleCalendar,
} from "@full-stack-cf-app/api/calendar/application/calendar-use-cases";
import { env } from "@full-stack-cf-app/env/server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import { z } from "zod";

const calendarWatchStartInputSchema = z.object({
	connectionId: z.string().trim().min(1),
	webhookUrl: z.url(),
	ttlSeconds: z.number().int().min(60).max(604_800).optional().default(86_400),
});

const calendarWatchStopInputSchema = z.object({
	connectionId: z.string().trim().min(1),
});

const calendarWatchRenewInputSchema = z.object({
	webhookUrl: z.url(),
	ttlSeconds: z.number().int().min(60).max(604_800).optional().default(86_400),
	renewBeforeSeconds: z
		.number()
		.int()
		.min(60)
		.max(604_800)
		.optional()
		.default(21_600),
});

const calendarTaskAuthMiddleware = createMiddleware(async (c, next) => {
	const token = env.CALENDAR_SYNC_TASK_TOKEN;
	if (!token) {
		return c.json({ error: "Calendar sync task token is not configured" }, 404);
	}

	// Hono's built-in bearer middleware gives us timing-safe compares and
	// consistent `WWW-Authenticate` headers on failures.
	const middleware = bearerAuth({
		token,
		noAuthenticationHeader: { message: { error: "Unauthorized" } },
		invalidAuthenticationHeader: { message: { error: "Unauthorized" } },
		invalidToken: { message: { error: "Unauthorized" } },
	});

	return await middleware(c, next);
});

const validateCalendarWatchStartPayload = validator("json", (value, c) => {
	const parsed = calendarWatchStartInputSchema.safeParse(value);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid payload", issues: parsed.error.flatten() },
			400
		);
	}
	return parsed.data;
});

const validateCalendarWatchStopPayload = validator("json", (value, c) => {
	const parsed = calendarWatchStopInputSchema.safeParse(value);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid payload", issues: parsed.error.flatten() },
			400
		);
	}
	return parsed.data;
});

const validateCalendarWatchRenewPayload = validator("json", (value, c) => {
	const parsed = calendarWatchRenewInputSchema.safeParse(value);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid payload", issues: parsed.error.flatten() },
			400
		);
	}
	return parsed.data;
});

const mapOutcomeToResponse = (
	outcome: { kind: string },
	successStatus: 200 | 202 = 200
) => {
	if (outcome.kind === "error" && "message" in outcome) {
		return {
			status: 500 as const,
			body: { error: (outcome as { message: string }).message },
		};
	}
	const { kind: _, ...rest } = outcome;
	return { status: successStatus, body: { ok: true, ...rest } };
};

export const calendarInternalRoutes = new Hono();

calendarInternalRoutes.use("/internal/calendar/*", calendarTaskAuthMiddleware);

calendarInternalRoutes.post("/internal/calendar/sync/google", async (c) => {
	const outcome = await syncGoogleCalendar();
	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});

calendarInternalRoutes.post(
	"/internal/calendar/watch/google/start",
	validateCalendarWatchStartPayload,
	async (c) => {
		const payload = c.req.valid("json");

		const outcome = await startGoogleWatch({
			connectionId: payload.connectionId,
			webhookUrl: payload.webhookUrl,
			channelToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
			ttlSeconds: payload.ttlSeconds,
		});

		const { status, body } = mapOutcomeToResponse(outcome);
		return c.json(body, status);
	}
);

calendarInternalRoutes.post(
	"/internal/calendar/watch/google/stop",
	validateCalendarWatchStopPayload,
	async (c) => {
		const payload = c.req.valid("json");

		const outcome = await stopGoogleWatch({
			connectionId: payload.connectionId,
		});

		const { status, body } = mapOutcomeToResponse(outcome);
		return c.json(body, status);
	}
);

calendarInternalRoutes.post(
	"/internal/calendar/watch/google/renew",
	validateCalendarWatchRenewPayload,
	async (c) => {
		const payload = c.req.valid("json");

		const outcome = await renewGoogleWatches({
			webhookUrl: payload.webhookUrl,
			channelToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
			ttlSeconds: payload.ttlSeconds,
			renewBeforeSeconds: payload.renewBeforeSeconds,
		});

		const { status, body } = mapOutcomeToResponse(outcome);
		return c.json(body, status);
	}
);

calendarInternalRoutes.get(
	"/internal/calendar/webhook/google/dead-letter",
	async (c) => {
		const limitRaw = c.req.query("limit");
		const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
		if (limitRaw && Number.isNaN(limit)) {
			return c.json({ error: "Invalid query: limit must be a number" }, 400);
		}

		const outcome = await listGoogleDeadLetters({ limit });
		const { status, body } = mapOutcomeToResponse(outcome);
		return c.json(body, status);
	}
);

calendarInternalRoutes.post(
	"/internal/calendar/sync/google/retry",
	async (c) => {
		const outcome = await retryFailedGoogleSyncs();
		const { status, body } = mapOutcomeToResponse(outcome);
		return c.json(body, status);
	}
);
