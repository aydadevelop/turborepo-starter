import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = {
	CALENDAR_SYNC_TASK_TOKEN: "",
	GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN: "",
};

const syncGoogleCalendarMock = vi.fn();
const startGoogleWatchMock = vi.fn();
const stopGoogleWatchMock = vi.fn();
const renewGoogleWatchesMock = vi.fn();
const listGoogleDeadLettersMock = vi.fn();

vi.mock("@full-stack-cf-app/env/server", () => {
	return {
		env: envState,
	};
});

vi.mock(
	"@full-stack-cf-app/api/calendar/application/calendar-use-cases",
	() => {
		return {
			syncGoogleCalendar: syncGoogleCalendarMock,
			startGoogleWatch: startGoogleWatchMock,
			stopGoogleWatch: stopGoogleWatchMock,
			renewGoogleWatches: renewGoogleWatchesMock,
			listGoogleDeadLetters: listGoogleDeadLettersMock,
		};
	}
);

describe("calendarInternalRoutes", () => {
	beforeEach(() => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "";
		envState.GOOGLE_CALENDAR_WEBHOOK_SHARED_TOKEN = "";

		syncGoogleCalendarMock.mockReset();
		startGoogleWatchMock.mockReset();
		stopGoogleWatchMock.mockReset();
		renewGoogleWatchesMock.mockReset();
		listGoogleDeadLettersMock.mockReset();

		syncGoogleCalendarMock.mockResolvedValue({
			kind: "ok",
			provider: "google",
			totalConnections: 1,
			results: [],
		});
		startGoogleWatchMock.mockResolvedValue({
			kind: "ok",
			connectionId: "connection-1",
			provider: "google",
			watch: {
				channelId: "channel-1",
				resourceId: "resource-1",
				expirationAt: new Date(Date.now() + 3_600_000),
			},
		});
		stopGoogleWatchMock.mockResolvedValue({
			kind: "ok",
			connectionId: "connection-1",
			provider: "google",
			stopped: true,
		});
		renewGoogleWatchesMock.mockResolvedValue({
			kind: "ok",
			provider: "google",
			renewBeforeSeconds: 21_600,
			totalCandidates: 1,
			renewedCount: 1,
			results: [],
		});
		listGoogleDeadLettersMock.mockResolvedValue({
			kind: "ok",
			total: 0,
			items: [],
		});
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
		expect(syncGoogleCalendarMock).not.toHaveBeenCalled();
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
		expect(syncGoogleCalendarMock).not.toHaveBeenCalled();
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
		expect(startGoogleWatchMock).not.toHaveBeenCalled();
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
		expect(startGoogleWatchMock).toHaveBeenCalledWith({
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
		expect(stopGoogleWatchMock).toHaveBeenCalledWith({
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
		expect(renewGoogleWatchesMock).toHaveBeenCalledWith({
			webhookUrl: "https://example.com/webhook",
			channelToken: "shared-token",
			ttlSeconds: 86_400,
			renewBeforeSeconds: 21_600,
		});
	});

	it("returns webhook dead letters", async () => {
		envState.CALENDAR_SYNC_TASK_TOKEN = "sync-token";
		listGoogleDeadLettersMock.mockResolvedValueOnce({
			kind: "ok",
			total: 1,
			items: [{ id: "event-1", status: "failed" }],
		});
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
		expect(listGoogleDeadLettersMock).toHaveBeenCalledWith({
			limit: 10,
		});
		expect(await response.json()).toEqual({
			ok: true,
			total: 1,
			items: [{ id: "event-1", status: "failed" }],
		});
	});
});
