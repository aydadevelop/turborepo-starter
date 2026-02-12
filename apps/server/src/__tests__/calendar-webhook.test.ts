import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = {
	GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN: "",
};

const syncCalendarConnectionByWebhookMock = vi.fn();
const getCalendarAdapterMock = vi.fn();

vi.mock("@full-stack-cf-app/env/server", () => {
	return {
		env: envState,
	};
});

vi.mock("@full-stack-cf-app/api/calendar/sync/connection-sync", () => {
	return {
		syncCalendarConnectionByWebhook: syncCalendarConnectionByWebhookMock,
	};
});

vi.mock("@full-stack-cf-app/api/calendar/adapters/registry", () => {
	return {
		getCalendarAdapter: getCalendarAdapterMock,
	};
});

describe("calendarWebhookRoutes", () => {
	beforeEach(() => {
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "";
		syncCalendarConnectionByWebhookMock.mockReset();
		getCalendarAdapterMock.mockReset();
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: vi.fn(() => ({
				channelId: "channel-1",
				resourceId: "resource-1",
				resourceState: "exists",
				channelToken: "token-1",
			})),
		});
		syncCalendarConnectionByWebhookMock.mockResolvedValue({
			matched: true,
			duplicate: false,
			webhookEventId: "event-1",
		});
	});

	it("returns 202 when google adapter is not configured", async () => {
		getCalendarAdapterMock.mockReturnValue({});
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
		syncCalendarConnectionByWebhookMock.mockResolvedValueOnce({
			matched: true,
			duplicate: true,
			webhookEventId: "event-1",
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
