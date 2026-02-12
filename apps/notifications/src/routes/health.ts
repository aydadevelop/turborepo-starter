import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
	return c.json({ ok: true, service: "notifications-worker" });
});

healthRoutes.get("/notifications/health", (c) => {
	return c.json({ ok: true, service: "notifications-worker" });
});
