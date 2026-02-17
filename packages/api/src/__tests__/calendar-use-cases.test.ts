import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getCalendarAdapterMock,
	syncCalendarConnectionByIdMock,
	syncCalendarConnectionByWebhookMock,
	syncCalendarConnectionsByProviderMock,
	startCalendarConnectionWatchMock,
	stopCalendarConnectionWatchMock,
	renewExpiringCalendarWatchesMock,
	listCalendarWebhookDeadLettersMock,
	retryFailedCalendarSyncsMock,
} = vi.hoisted(() => ({
	getCalendarAdapterMock: vi.fn(),
	syncCalendarConnectionByIdMock: vi.fn(),
	syncCalendarConnectionByWebhookMock: vi.fn(),
	syncCalendarConnectionsByProviderMock: vi.fn(),
	startCalendarConnectionWatchMock: vi.fn(),
	stopCalendarConnectionWatchMock: vi.fn(),
	renewExpiringCalendarWatchesMock: vi.fn(),
	listCalendarWebhookDeadLettersMock: vi.fn(),
	retryFailedCalendarSyncsMock: vi.fn(),
}));

vi.mock("../calendar/adapters/registry", () => ({
	getCalendarAdapter: getCalendarAdapterMock,
}));

vi.mock("../calendar/sync/connection-sync", () => ({
	syncCalendarConnectionById: syncCalendarConnectionByIdMock,
	syncCalendarConnectionByWebhook: syncCalendarConnectionByWebhookMock,
	syncCalendarConnectionsByProvider: syncCalendarConnectionsByProviderMock,
	startCalendarConnectionWatch: startCalendarConnectionWatchMock,
	stopCalendarConnectionWatch: stopCalendarConnectionWatchMock,
	renewExpiringCalendarWatches: renewExpiringCalendarWatchesMock,
	listCalendarWebhookDeadLetters: listCalendarWebhookDeadLettersMock,
	retryFailedCalendarSyncs: retryFailedCalendarSyncsMock,
}));

import {
	ingestCalendarWebhook,
	initialSyncCalendarConnection,
	listGoogleDeadLetters,
	renewGoogleWatches,
	resyncCalendarConnection,
	retryFailedGoogleSyncs,
	startGoogleWatch,
	stopGoogleWatch,
	syncGoogleCalendar,
} from "../calendar/application/calendar-use-cases";

describe("ingestCalendarWebhook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns adapter_not_configured when adapter has no parseWebhookNotification", async () => {
		getCalendarAdapterMock.mockReturnValue({});
		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});
		expect(result).toEqual({ kind: "adapter_not_configured" });
	});

	it("returns adapter_not_configured when adapter is null", async () => {
		getCalendarAdapterMock.mockReturnValue(null);
		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});
		expect(result).toEqual({ kind: "adapter_not_configured" });
	});

	it("returns missing_headers when parseWebhookNotification returns null", async () => {
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: () => null,
		});
		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});
		expect(result).toEqual({ kind: "missing_headers" });
	});

	it("returns unauthorized when channelToken does not match sharedToken", async () => {
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: () => ({
				channelId: "ch-1",
				resourceId: "res-1",
				resourceState: "exists",
				channelToken: "wrong-token",
			}),
		});

		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
			sharedToken: "correct-token",
		});

		expect(result).toEqual({ kind: "unauthorized" });
		expect(syncCalendarConnectionByWebhookMock).not.toHaveBeenCalled();
	});

	it("does not check token when sharedToken is undefined", async () => {
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: () => ({
				channelId: "ch-1",
				resourceId: "res-1",
				resourceState: "exists",
				channelToken: "any-token",
			}),
		});
		syncCalendarConnectionByWebhookMock.mockResolvedValue({
			matched: true,
			duplicate: false,
			webhookEventId: "evt-1",
		});

		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});

		expect(result.kind).toBe("accepted");
	});

	it("returns duplicate when sync reports duplicate", async () => {
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: () => ({
				channelId: "ch-1",
				resourceId: "res-1",
				resourceState: "exists",
				channelToken: "tok",
			}),
		});
		syncCalendarConnectionByWebhookMock.mockResolvedValue({
			matched: true,
			duplicate: true,
			webhookEventId: "evt-dup",
			previousStatus: "processed",
		});

		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});

		expect(result).toEqual({
			kind: "duplicate",
			webhookEventId: "evt-dup",
			matched: true,
			previousStatus: "processed",
		});
	});

	it("returns accepted with sync details when successful", async () => {
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: () => ({
				channelId: "ch-1",
				resourceId: "res-1",
				resourceState: "exists",
				channelToken: "tok",
			}),
		});
		syncCalendarConnectionByWebhookMock.mockResolvedValue({
			matched: true,
			duplicate: false,
			webhookEventId: "evt-1",
			connectionId: "conn-1",
			provider: "google",
			processedEvents: 3,
			nextSyncToken: "sync-2",
			recoveredFromExpiredToken: false,
		});

		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});

		expect(result).toEqual({
			kind: "accepted",
			webhookEventId: "evt-1",
			matched: true,
			connectionId: "conn-1",
			provider: "google",
			processedEvents: 3,
			nextSyncToken: "sync-2",
			recoveredFromExpiredToken: false,
		});
	});

	it("returns accepted with matched=false when no connection found", async () => {
		getCalendarAdapterMock.mockReturnValue({
			parseWebhookNotification: () => ({
				channelId: "ch-orphan",
				resourceId: "res-orphan",
				resourceState: "exists",
				channelToken: "tok",
			}),
		});
		syncCalendarConnectionByWebhookMock.mockResolvedValue({
			matched: false,
			duplicate: false,
			webhookEventId: "evt-orphan",
		});

		const result = await ingestCalendarWebhook({
			provider: "google",
			headers: new Headers(),
		});

		expect(result).toEqual({
			kind: "accepted",
			webhookEventId: "evt-orphan",
			matched: false,
			connectionId: undefined,
			provider: undefined,
			processedEvents: undefined,
			nextSyncToken: undefined,
			recoveredFromExpiredToken: undefined,
		});
	});
});

describe("syncGoogleCalendar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with provider results on success", async () => {
		syncCalendarConnectionsByProviderMock.mockResolvedValue({
			provider: "google",
			totalConnections: 2,
			results: [],
		});

		const result = await syncGoogleCalendar();
		expect(result).toEqual({
			kind: "ok",
			provider: "google",
			totalConnections: 2,
			results: [],
		});
	});

	it("returns error on failure", async () => {
		syncCalendarConnectionsByProviderMock.mockRejectedValue(
			new Error("DB down")
		);

		const result = await syncGoogleCalendar();
		expect(result).toEqual({
			kind: "error",
			message: "Failed to run calendar polling sync",
		});
	});
});

describe("startGoogleWatch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with watch details on success", async () => {
		startCalendarConnectionWatchMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			watch: {
				channelId: "ch-new",
				resourceId: "res-new",
				expirationAt: new Date("2026-03-01T00:00:00Z"),
			},
		});
		syncCalendarConnectionByIdMock.mockResolvedValue({});

		const result = await startGoogleWatch({
			connectionId: "conn-1",
			webhookUrl: "https://example.com/webhook",
		});

		expect(result.kind).toBe("ok");
	});

	it("triggers background sync after watch start", async () => {
		startCalendarConnectionWatchMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			watch: {
				channelId: "ch-new",
				resourceId: "res-new",
				expirationAt: new Date("2026-03-01T00:00:00Z"),
			},
		});
		syncCalendarConnectionByIdMock.mockResolvedValue({});

		await startGoogleWatch({
			connectionId: "conn-1",
			webhookUrl: "https://example.com/webhook",
		});

		expect(syncCalendarConnectionByIdMock).toHaveBeenCalledWith("conn-1");
	});

	it("returns error on failure", async () => {
		startCalendarConnectionWatchMock.mockRejectedValue(
			new Error("API unavailable")
		);

		const result = await startGoogleWatch({
			connectionId: "conn-1",
			webhookUrl: "https://example.com/webhook",
		});

		expect(result).toEqual({
			kind: "error",
			message: "Failed to start calendar watch",
		});
	});
});

describe("stopGoogleWatch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok on success", async () => {
		stopCalendarConnectionWatchMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			stopped: true,
		});

		const result = await stopGoogleWatch({ connectionId: "conn-1" });
		expect(result.kind).toBe("ok");
	});

	it("returns error on failure", async () => {
		stopCalendarConnectionWatchMock.mockRejectedValue(new Error("API error"));

		const result = await stopGoogleWatch({ connectionId: "conn-1" });
		expect(result).toEqual({
			kind: "error",
			message: "Failed to stop calendar watch",
		});
	});
});

describe("renewGoogleWatches", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with renewal results on success", async () => {
		renewExpiringCalendarWatchesMock.mockResolvedValue({
			provider: "google",
			renewBeforeSeconds: 21_600,
			totalCandidates: 2,
			renewedCount: 2,
			results: [],
		});

		const result = await renewGoogleWatches({
			webhookUrl: "https://example.com/webhooks",
		});

		expect(result.kind).toBe("ok");
	});

	it("returns error on failure", async () => {
		renewExpiringCalendarWatchesMock.mockRejectedValue(
			new Error("Renew failed")
		);

		const result = await renewGoogleWatches({
			webhookUrl: "https://example.com/webhooks",
		});

		expect(result).toEqual({
			kind: "error",
			message: "Failed to renew calendar watches",
		});
	});
});

describe("listGoogleDeadLetters", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with dead letter items", async () => {
		listCalendarWebhookDeadLettersMock.mockResolvedValue([
			{ id: "dl-1", status: "failed" },
		]);

		const result = await listGoogleDeadLetters({ limit: 10 });
		expect(result).toEqual({
			kind: "ok",
			total: 1,
			items: [{ id: "dl-1", status: "failed" }],
		});
	});

	it("returns error on failure", async () => {
		listCalendarWebhookDeadLettersMock.mockRejectedValue(
			new Error("Query failed")
		);

		const result = await listGoogleDeadLetters({});
		expect(result).toEqual({
			kind: "error",
			message: "Failed to list calendar webhook dead letters",
		});
	});
});

describe("initialSyncCalendarConnection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with sync details on success", async () => {
		syncCalendarConnectionByIdMock.mockResolvedValue({
			connectionId: "conn-new",
			provider: "google",
			processedEvents: 5,
			nextSyncToken: "tok-1",
			recoveredFromExpiredToken: false,
		});

		const result = await initialSyncCalendarConnection({
			connectionId: "conn-new",
		});

		expect(result).toEqual({
			kind: "ok",
			connectionId: "conn-new",
			provider: "google",
			processedEvents: 5,
			nextSyncToken: "tok-1",
		});
		expect(syncCalendarConnectionByIdMock).toHaveBeenCalledWith("conn-new", {
			initialTimeMin: expect.any(Date),
		});
	});

	it("passes initialTimeMin as current time (forward-only)", async () => {
		syncCalendarConnectionByIdMock.mockResolvedValue({
			connectionId: "conn-new",
			provider: "google",
			processedEvents: 0,
			nextSyncToken: "tok-1",
			recoveredFromExpiredToken: false,
		});

		const before = new Date();
		await initialSyncCalendarConnection({ connectionId: "conn-new" });
		const after = new Date();

		const passedTimeMin =
			syncCalendarConnectionByIdMock.mock.calls[0][1].initialTimeMin;
		expect(passedTimeMin.getTime()).toBeGreaterThanOrEqual(before.getTime());
		expect(passedTimeMin.getTime()).toBeLessThanOrEqual(after.getTime());
	});

	it("returns skipped when connection is disabled", async () => {
		syncCalendarConnectionByIdMock.mockResolvedValue({
			connectionId: "conn-disabled",
			provider: "google",
			processedEvents: 0,
			nextSyncToken: null,
			recoveredFromExpiredToken: false,
			skipped: true,
		});

		const result = await initialSyncCalendarConnection({
			connectionId: "conn-disabled",
		});

		expect(result).toEqual({
			kind: "skipped",
			connectionId: "conn-disabled",
		});
	});

	it("returns error on failure", async () => {
		syncCalendarConnectionByIdMock.mockRejectedValue(
			new Error("Adapter not found")
		);

		const result = await initialSyncCalendarConnection({
			connectionId: "conn-fail",
		});

		expect(result).toEqual({
			kind: "error",
			connectionId: "conn-fail",
			message: "Adapter not found",
		});
	});
});

describe("resyncCalendarConnection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with sync details on success", async () => {
		syncCalendarConnectionByIdMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			processedEvents: 3,
			nextSyncToken: "tok-2",
			recoveredFromExpiredToken: false,
		});

		const result = await resyncCalendarConnection({
			connectionId: "conn-1",
		});

		expect(result).toEqual({
			kind: "ok",
			connectionId: "conn-1",
			provider: "google",
			processedEvents: 3,
			nextSyncToken: "tok-2",
			recoveredFromExpiredToken: false,
		});
		expect(syncCalendarConnectionByIdMock).toHaveBeenCalledWith("conn-1");
	});

	it("returns skipped when connection is disabled", async () => {
		syncCalendarConnectionByIdMock.mockResolvedValue({
			connectionId: "conn-disabled",
			provider: "google",
			processedEvents: 0,
			nextSyncToken: null,
			recoveredFromExpiredToken: false,
			skipped: true,
		});

		const result = await resyncCalendarConnection({
			connectionId: "conn-disabled",
		});

		expect(result).toEqual({
			kind: "skipped",
			connectionId: "conn-disabled",
		});
	});

	it("returns error on failure", async () => {
		syncCalendarConnectionByIdMock.mockRejectedValue(
			new Error("Calendar API down")
		);

		const result = await resyncCalendarConnection({
			connectionId: "conn-fail",
		});

		expect(result).toEqual({
			kind: "error",
			connectionId: "conn-fail",
			message: "Calendar API down",
		});
	});
});

describe("retryFailedGoogleSyncs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok with retry results on success", async () => {
		retryFailedCalendarSyncsMock.mockResolvedValue({
			provider: "google",
			totalErrorConnections: 3,
			eligibleCount: 2,
			retriedCount: 1,
			maxedOutCount: 1,
			results: [],
		});

		const result = await retryFailedGoogleSyncs();
		expect(result).toEqual({
			kind: "ok",
			provider: "google",
			totalErrorConnections: 3,
			eligibleCount: 2,
			retriedCount: 1,
			maxedOutCount: 1,
			results: [],
		});
	});

	it("returns error on failure", async () => {
		retryFailedCalendarSyncsMock.mockRejectedValue(new Error("DB error"));

		const result = await retryFailedGoogleSyncs();
		expect(result).toEqual({
			kind: "error",
			message: "Failed to retry failed calendar syncs",
		});
	});
});
