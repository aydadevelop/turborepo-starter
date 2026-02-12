import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = {
	CALENDAR_SYNC_TASK_TOKEN: "",
	GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN: "",
};

const syncCalendarConnectionsByProviderMock = vi.fn();
const startCalendarConnectionWatchMock = vi.fn();
const stopCalendarConnectionWatchMock = vi.fn();
const renewExpiringCalendarWatchesMock = vi.fn();
const listCalendarWebhookDeadLettersMock = vi.fn();

vi.mock("@full-stack-cf-app/env/server", () => {
	return {
		env: envState,
	};
});

vi.mock("@full-stack-cf-app/api/calendar/sync/connection-sync", () => {
	return {
		listCalendarWebhookDeadLetters: listCalendarWebhookDeadLettersMock,
		renewExpiringCalendarWatches: renewExpiringCalendarWatchesMock,
		syncCalendarConnectionsByProvider: syncCalendarConnectionsByProviderMock,
		startCalendarConnectionWatch: startCalendarConnectionWatchMock,
		stopCalendarConnectionWatch: stopCalendarConnectionWatchMock,
	};
});

describe("calendarInternalRoutes", () => {
	beforeEach(() => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "";
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "";

		syncCalendarConnectionsByProviderMock.mockReset();
		startCalendarConnectionWatchMock.mockReset();
		stopCalendarConnectionWatchMock.mockReset();
		renewExpiringCalendarWatchesMock.mockReset();
		listCalendarWebhookDeadLettersMock.mockReset();

		syncCalendarConnectionsByProviderMock.mockResolvedValue({
			processedConnections: 1,
			createdBlocks: 0,
			updatedBlocks: 0,
			deletedBlocks: 0,
			errors: [],
		});
		startCalendarConnectionWatchMock.mockResolvedValue({
			channelId: "channel-1",
			resourceId: "resource-1",
			expiresAt: Date.now() + 3_600_000,
		});
		stopCalendarConnectionWatchMock.mockResolvedValue({
			stopped: true,
		});
		renewExpiringCalendarWatchesMock.mockResolvedValue({
			provider: "google",
			renewBeforeSeconds: 21_600,
			totalCandidates: 1,
			renewedCount: 1,
			results: [],
		});
		listCalendarWebhookDeadLettersMock.mockResolvedValue([]);
	});

	it("returns 404 when calendar sync token is not configured", async () => {
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/sync/google",
			{
				method: "POST",
			}
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Calendar sync task token is not configured",
		});
		expect(syncCalendarConnectionsByProviderMock).not.toHaveBeenCalled();
	});

	it("returns 401 when bearer token is invalid", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/sync/google",
			{
				method: "POST",
				headers: {
					authorization: "Bearer wrong-token",
				},
			}
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
		expect(syncCalendarConnectionsByProviderMock).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid watch-start payload", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/watch/google/start",
			{
				method: "POST",
				headers: {
					authorization: "Bearer sync-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({}),
			}
		);

		expect(response.status).toBe(400);
		expect(startCalendarConnectionWatchMock).not.toHaveBeenCalled();
	});

	it("validates watch-start payload and applies default ttl", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "shared-token";
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/watch/google/start",
			{
				method: "POST",
				headers: {
					authorization: "Bearer sync-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					connectionId: "connection-1",
					webhookUrl: "https://example.com/webhook",
				}),
			}
		);

		expect(response.status).toBe(200);
		expect(startCalendarConnectionWatchMock).toHaveBeenCalledWith({
			connectionId: "connection-1",
			webhookUrl: "https://example.com/webhook",
			channelToken: "shared-token",
			ttlSeconds: 86_400,
		});
	});

	it("validates watch-stop payload", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/watch/google/stop",
			{
				method: "POST",
				headers: {
					authorization: "Bearer sync-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					connectionId: "connection-1",
				}),
			}
		);

		expect(response.status).toBe(200);
		expect(stopCalendarConnectionWatchMock).toHaveBeenCalledWith({
			connectionId: "connection-1",
		});
	});

	it("validates watch-renew payload and forwards defaults", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "shared-token";
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/watch/google/renew",
			{
				method: "POST",
				headers: {
					authorization: "Bearer sync-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					webhookUrl: "https://example.com/webhook",
				}),
			}
		);

		expect(response.status).toBe(200);
		expect(renewExpiringCalendarWatchesMock).toHaveBeenCalledWith({
			provider: "google",
			webhookUrl: "https://example.com/webhook",
			channelToken: "shared-token",
			ttlSeconds: 86_400,
			renewBeforeSeconds: 21_600,
		});
	});

	it("returns webhook dead letters", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		listCalendarWebhookDeadLettersMock.mockResolvedValueOnce([
			{
				id: "event-1",
				status: "failed",
			},
		]);
		const { calendarInternalRoutes } = await import(
			"../routes/calendar-internal"
		);

		const response = await calendarInternalRoutes.request(
			"/internal/calendar/webhook/google/dead-letter?limit=10",
			{
				method: "GET",
				headers: {
					authorization: "Bearer sync-token",
				},
			}
		);

		expect(response.status).toBe(200);
		expect(listCalendarWebhookDeadLettersMock).toHaveBeenCalledWith({
			provider: "google",
			limit: 10,
		});
		expect(await response.json()).toEqual({
			ok: true,
			total: 1,
			items: [{ id: "event-1", status: "failed" }],
		});
	});
});
