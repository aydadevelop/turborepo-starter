import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = {
	GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN: "",
};

const ingestCalendarWebhookMock = vi.fn();
const createContextMock = vi.fn();

vi.mock("@full-stack-cf-app/env/server", () => {
	return {
		env: envState,
	};
});

vi.mock(
	"@full-stack-cf-app/api/calendar/application/calendar-use-cases",
	() => {
		return {
			ingestCalendarWebhook: ingestCalendarWebhookMock,
		};
	}
);

vi.mock("@full-stack-cf-app/api/context", () => {
	return {
		createContext: createContextMock,
	};
});

describe("calendarWebhookRoutes", () => {
	beforeEach(() => {
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "";
		ingestCalendarWebhookMock.mockReset();
		createContextMock.mockReset();
		createContextMock.mockResolvedValue({
			notificationQueue: undefined,
		});
		ingestCalendarWebhookMock.mockResolvedValue({
			kind: "accepted",
			webhookEventId: "event-1",
			matched: true,
		});
	});

	it("returns 202 when google adapter is not configured", async () => {
		ingestCalendarWebhookMock.mockResolvedValueOnce({
			kind: "adapter_not_configured",
		});
		const { calendarWebhookRoutes } = await import(
			"../routes/calendar-webhook"
		);

		const response = await calendarWebhookRoutes.request(
			"/webhooks/calendar/google",
			{
				method: "POST",
			}
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			ok: true,
			skipped: "google_adapter_not_configured",
		});
	});

	it("returns 401 when shared token does not match", async () => {
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "expected-token";
		ingestCalendarWebhookMock.mockResolvedValueOnce({
			kind: "unauthorized",
		});
		const { calendarWebhookRoutes } = await import(
			"../routes/calendar-webhook"
		);

		const response = await calendarWebhookRoutes.request(
			"/webhooks/calendar/google",
			{
				method: "POST",
			}
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized webhook token",
		});
	});

	it("returns 200 for duplicate webhook deliveries", async () => {
		ingestCalendarWebhookMock.mockResolvedValueOnce({
			kind: "duplicate",
			webhookEventId: "event-1",
			matched: true,
			previousStatus: "processed",
		});
		const { calendarWebhookRoutes } = await import(
			"../routes/calendar-webhook"
		);

		const response = await calendarWebhookRoutes.request(
			"/webhooks/calendar/google",
			{
				method: "POST",
			}
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			matched: true,
			duplicate: true,
			webhookEventId: "event-1",
			previousStatus: "processed",
		});
	});

	it("returns 202 for non-duplicate webhook deliveries", async () => {
		const { calendarWebhookRoutes } = await import(
			"../routes/calendar-webhook"
		);

		const response = await calendarWebhookRoutes.request(
			"/webhooks/calendar/google",
			{
				method: "POST",
			}
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			ok: true,
			matched: true,
			duplicate: false,
			webhookEventId: "event-1",
		});
	});
});
