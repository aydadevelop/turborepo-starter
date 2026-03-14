import { timingSafeEqual } from "node:crypto";
import {
	listGoogleDeadLetters,
	renewGoogleWatches,
	retryFailedGoogleSyncs,
	startGoogleWatch,
	stopGoogleWatch,
	syncGoogleCalendar,
} from "@my-app/calendar";
import { db } from "@my-app/db";
import { env } from "@my-app/env/server";
import { Hono } from "hono";
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

const unauthorizedResponse = { error: "Unauthorized" };

const verifyBearerToken = (provided: string | undefined, expected: string) => {
	if (!provided) {
		return false;
	}
	const providedBuffer = Buffer.from(provided);
	const expectedBuffer = Buffer.from(expected);
	if (providedBuffer.length !== expectedBuffer.length) {
		return false;
	}
	return timingSafeEqual(providedBuffer, expectedBuffer);
};
const authenticateTaskRequest = (authorizationHeader: string | undefined) => {
	const token = env.CALENDAR_SYNC_TASK_TOKEN;
	if (!token) {
		return { status: 404 as const, body: { error: "Calendar sync task token is not configured" } };
	}

	const bearerPrefix = "Bearer ";
	if (!(authorizationHeader && authorizationHeader.startsWith(bearerPrefix))) {
		return { status: 401 as const, body: unauthorizedResponse };
	}

	const providedToken = authorizationHeader.slice(bearerPrefix.length).trim();
	if (!verifyBearerToken(providedToken, token)) {
		return { status: 401 as const, body: unauthorizedResponse };
	}

	return null;
};

const mapOutcomeToResponse = (
	outcome: { kind: string },
	successStatus: 200 | 202 = 200,
) => {
	if (outcome.kind === "error" && "message" in outcome) {
		return {
			status: 500 as const,
			body: { error: (outcome as { message: string }).message },
		};
	}

	const { kind: _kind, ...rest } = outcome;
	return { status: successStatus, body: { ok: true, ...rest } };
};

const parseJsonBody = async (request: Request) => {
	try {
		return await request.json();
	} catch {
		return null;
	}
};

export const calendarInternalRoutes = new Hono();

calendarInternalRoutes.post("/internal/calendar/sync/google", async (c) => {
	const authError = authenticateTaskRequest(c.req.header("authorization"));
	if (authError) {
		return c.json(authError.body, authError.status);
	}

	const outcome = await syncGoogleCalendar(db);
	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});

calendarInternalRoutes.post("/internal/calendar/watch/google/start", async (c) => {
	const authError = authenticateTaskRequest(c.req.header("authorization"));
	if (authError) {
		return c.json(authError.body, authError.status);
	}

	const parsed = calendarWatchStartInputSchema.safeParse(await parseJsonBody(c.req.raw));
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid payload", issues: parsed.error.flatten() },
			400,
		);
	}

	const outcome = await startGoogleWatch(
		{
			connectionId: parsed.data.connectionId,
			webhookUrl: parsed.data.webhookUrl,
			channelToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
			ttlSeconds: parsed.data.ttlSeconds,
		},
		db,
	);

	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});

calendarInternalRoutes.post("/internal/calendar/watch/google/stop", async (c) => {
	const authError = authenticateTaskRequest(c.req.header("authorization"));
	if (authError) {
		return c.json(authError.body, authError.status);
	}

	const parsed = calendarWatchStopInputSchema.safeParse(await parseJsonBody(c.req.raw));
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid payload", issues: parsed.error.flatten() },
			400,
		);
	}

	const outcome = await stopGoogleWatch({ connectionId: parsed.data.connectionId }, db);
	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});

calendarInternalRoutes.post("/internal/calendar/watch/google/renew", async (c) => {
	const authError = authenticateTaskRequest(c.req.header("authorization"));
	if (authError) {
		return c.json(authError.body, authError.status);
	}

	const parsed = calendarWatchRenewInputSchema.safeParse(await parseJsonBody(c.req.raw));
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid payload", issues: parsed.error.flatten() },
			400,
		);
	}

	const outcome = await renewGoogleWatches(
		{
			webhookUrl: parsed.data.webhookUrl,
			channelToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
			ttlSeconds: parsed.data.ttlSeconds,
			renewBeforeSeconds: parsed.data.renewBeforeSeconds,
		},
		db,
	);

	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});

calendarInternalRoutes.get("/internal/calendar/webhook/google/dead-letter", async (c) => {
	const authError = authenticateTaskRequest(c.req.header("authorization"));
	if (authError) {
		return c.json(authError.body, authError.status);
	}

	const limitRaw = c.req.query("limit");
	const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
	if (limitRaw && Number.isNaN(limit)) {
		return c.json({ error: "Invalid query: limit must be a number" }, 400);
	}

	const outcome = await listGoogleDeadLetters({ limit }, db);
	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});

calendarInternalRoutes.post("/internal/calendar/sync/google/retry", async (c) => {
	const authError = authenticateTaskRequest(c.req.header("authorization"));
	if (authError) {
		return c.json(authError.body, authError.status);
	}

	const outcome = await retryFailedGoogleSyncs(db);
	const { status, body } = mapOutcomeToResponse(outcome);
	return c.json(body, status);
});