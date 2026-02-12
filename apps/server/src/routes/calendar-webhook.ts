import { getCalendarAdapter } from "@full-stack-cf-app/api/calendar/adapters/registry";
import { syncCalendarConnectionByWebhook } from "@full-stack-cf-app/api/calendar/sync/connection-sync";
import { env } from "@full-stack-cf-app/env/server";
import { Hono } from "hono";

export const calendarWebhookRoutes = new Hono();

calendarWebhookRoutes.post("/webhooks/calendar/google", async (c) => {
	const adapter = getCalendarAdapter("google");
	if (!adapter?.parseWebhookNotification) {
		return c.json(
			{
				ok: true,
				skipped: "google_adapter_not_configured",
			},
			202
		);
	}

	const notification = adapter.parseWebhookNotification(c.req.raw.headers);
	if (!notification) {
		return c.json(
			{
				ok: true,
				skipped: "missing_required_headers",
			},
			202
		);
	}

	if (
		env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN &&
		notification.channelToken !== env.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN
	) {
		return c.json({ error: "Unauthorized webhook token" }, 401);
	}

	try {
		const result = await syncCalendarConnectionByWebhook({
			provider: "google",
			notification,
		});
		const responseStatus = result.duplicate ? 200 : 202;
		return c.json(
			{
				ok: true,
				...result,
			},
			responseStatus
		);
	} catch (error) {
		console.error("Failed to process Google Calendar webhook", error);
		return c.json({ error: "Failed to process webhook notification" }, 500);
	}
});
