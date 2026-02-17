import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
	return c.json({ ok: true, service: "assistant-worker" });
});

healthRoutes.get("/assistant/health", (c) => {
	return c.json({ ok: true, service: "assistant-worker" });
});
