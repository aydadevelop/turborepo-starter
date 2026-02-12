import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

const configureCalendarAdaptersFromEnvMock = vi.fn();

vi.mock("@full-stack-cf-app/api/calendar/adapters/configure", () => {
	return {
		configureCalendarAdaptersFromEnv: configureCalendarAdaptersFromEnvMock,
	};
});

vi.mock("@full-stack-cf-app/env/server", () => {
	return {
		env: {
			CORS_ORIGIN: "http://localhost:5173",
			GOOGLE_CALENDAR_CREDENTIALS_JSON: "",
		},
	};
});

vi.mock("../routes/auth", () => {
	return {
		authRoutes: new Hono(),
	};
});

vi.mock("../routes/calendar-webhook", () => {
	return {
		calendarWebhookRoutes: new Hono(),
	};
});

vi.mock("../routes/calendar-internal", () => {
	return {
		calendarInternalRoutes: new Hono(),
	};
});

vi.mock("../rpc/handlers", () => {
	return {
		rpcMiddleware: async (_c: unknown, next: () => Promise<void>) => {
			await next();
		},
	};
});

vi.mock("../routes/health", () => {
	const healthRoutes = new Hono();

	healthRoutes.get("/", (c) => c.text("OK"));
	healthRoutes.get("/boom", () => {
		throw new Error("boom");
	});
	healthRoutes.get("/teapot", () => {
		throw new HTTPException(418, { message: "teapot" });
	});

	return {
		healthRoutes,
	};
});

describe("app", () => {
	beforeEach(() => {
		vi.resetModules();
		configureCalendarAdaptersFromEnvMock.mockReset();
	});

	it("returns JSON not found response for unknown routes", async () => {
		const { app } = await import("../app");

		const response = await app.request("/missing");

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Not Found" });
	});

	it("returns JSON internal server error for unexpected exceptions", async () => {
		const { app } = await import("../app");

		const response = await app.request("/boom");

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Internal Server Error" });
	});

	it("returns HTTPException responses unchanged", async () => {
		const { app } = await import("../app");

		const response = await app.request("/teapot");

		expect(response.status).toBe(418);
		expect(await response.text()).toContain("teapot");
	});

	it("configures calendar adapters during app bootstrap", async () => {
		await import("../app");

		expect(configureCalendarAdaptersFromEnvMock).toHaveBeenCalledWith({
			GOOGLE_CALENDAR_CREDENTIALS_JSON: "",
		});
	});
});
