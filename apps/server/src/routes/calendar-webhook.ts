import { ingestCalendarWebhook } from "@my-app/calendar";
import { db } from "@my-app/db";
import { env } from "@my-app/env/server";
import { context, trace } from "@opentelemetry/api";
import { Hono } from "hono";

export const calendarWebhookRoutes = new Hono();

const getRequestTraceId = (): string | null => {
	const span = trace.getSpan(context.active());
	return span?.spanContext().traceId ?? null;
};

const getRemoteIp = (headers: Headers): string | null => {
	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) {
		return forwarded.split(",")[0]?.trim() ?? null;
	}

	return headers.get("cf-connecting-ip");
};

calendarWebhookRoutes.post("/webhooks/calendar/google", async (c) => {
	const rawPayload = await c.req.text();
	const payload = rawPayload
		? (() => {
				try {
					const parsed = JSON.parse(rawPayload) as Record<string, unknown>;
					return typeof parsed === "object" && parsed !== null
						? parsed
						: { rawText: rawPayload };
				} catch {
					return { rawText: rawPayload };
				}
			})()
		: null;

	const outcome = await ingestCalendarWebhook(
		{
			provider: "google",
			headers: c.req.raw.headers,
			request: {
				method: c.req.method,
				path: c.req.path,
				host: c.req.header("host") ?? null,
				payload,
				remoteIp: getRemoteIp(c.req.raw.headers),
				requestId: c.req.header("x-request-id") ?? null,
				traceId: getRequestTraceId(),
				userAgent: c.req.header("user-agent") ?? null,
			},
			sharedToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
		},
		db,
	);

	switch (outcome.kind) {
		case "adapter_not_configured":
			return c.json(
				{ ok: true, skipped: "google_adapter_not_configured" },
				202,
			);
		case "missing_headers":
			return c.json({ ok: true, skipped: "missing_required_headers" }, 202);
		case "unauthorized":
			return c.json({ error: "Unauthorized webhook token" }, 401);
		case "duplicate":
			return c.json(
				{
					ok: true,
					matched: outcome.matched,
					duplicate: true,
					webhookEventId: outcome.webhookEventId,
					previousStatus: outcome.previousStatus,
				},
				200,
			);
		default:
			return c.json(
				{
					ok: true,
					matched: outcome.matched,
					duplicate: false,
					webhookEventId: outcome.webhookEventId,
				},
				202,
			);
	}
});