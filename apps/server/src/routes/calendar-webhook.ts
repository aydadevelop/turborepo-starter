import { ingestCalendarWebhook } from "@full-stack-cf-app/api/calendar/application/calendar-use-cases";
import { env } from "@full-stack-cf-app/env/server";
import { Hono } from "hono";

export const calendarWebhookRoutes = new Hono();

calendarWebhookRoutes.post("/webhooks/calendar/google", async (c) => {
	const outcome = await ingestCalendarWebhook({
		provider: "google",
		headers: c.req.raw.headers,
		sharedToken: env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN || undefined,
	});

	switch (outcome.kind) {
		case "adapter_not_configured":
			return c.json(
				{ ok: true, skipped: "google_adapter_not_configured" },
				202
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
				200
			);
		default:
			return c.json(
				{
					ok: true,
					matched: outcome.matched,
					duplicate: false,
					webhookEventId: outcome.webhookEventId,
				},
				202
			);
	}
});
