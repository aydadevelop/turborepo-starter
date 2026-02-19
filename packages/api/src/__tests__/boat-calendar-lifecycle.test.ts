import { organization } from "@full-stack-cf-app/db/schema/auth";
import {
	boat,
	boatCalendarConnection,
} from "@full-stack-cf-app/db/schema/boat";
import { bootstrapTestDatabase } from "@full-stack-cf-app/db/test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbState = bootstrapTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const startCalendarConnectionWatchMock = vi.fn();
const stopCalendarConnectionWatchMock = vi.fn();
const syncCalendarConnectionByIdMock = vi.fn();
const getCalendarAdapterMock = vi.fn();

vi.mock("../calendar/sync/connection-sync", () => ({
	startCalendarConnectionWatch: startCalendarConnectionWatchMock,
	stopCalendarConnectionWatch: stopCalendarConnectionWatchMock,
	syncCalendarConnectionById: syncCalendarConnectionByIdMock,
}));

vi.mock("../calendar/adapters/registry", () => ({
	getCalendarAdapter: getCalendarAdapterMock,
}));

const { reconcileBoatCalendarConnectionsOnStateChange } = await import(
	"../routers/boat/services/calendar-lifecycle"
);

const seedBoat = () => {
	testDbState.db
		.insert(organization)
		.values({
			id: "org-1",
			name: "Org 1",
			slug: "org-1",
		})
		.run();
	testDbState.db
		.insert(boat)
		.values({
			id: "boat-1",
			organizationId: "org-1",
			name: "Aurora",
			slug: "aurora",
			status: "active",
			isActive: true,
			passengerCapacity: 8,
			minimumHours: 1,
			timezone: "UTC",
		})
		.run();
};

const seedConnection = (
	overrides: Partial<typeof boatCalendarConnection.$inferInsert> = {}
) => {
	testDbState.db
		.insert(boatCalendarConnection)
		.values({
			id: "conn-1",
			boatId: "boat-1",
			provider: "google",
			externalCalendarId: "calendar-1",
			syncStatus: "idle",
			isPrimary: true,
			watchChannelId: "watch-channel-1",
			watchResourceId: "watch-resource-1",
			watchExpiresAt: new Date("2026-03-01T00:00:00.000Z"),
			...overrides,
		})
		.run();
};

describe("reconcileBoatCalendarConnectionsOnStateChange", () => {
	beforeAll(() => {
		seedBoat();
	});

	beforeEach(() => {
		startCalendarConnectionWatchMock.mockReset();
		stopCalendarConnectionWatchMock.mockReset();
		syncCalendarConnectionByIdMock.mockReset();
		getCalendarAdapterMock.mockReset();
	});

	it("disables sync and unsubscribes watch when boat transitions to disabled", async () => {
		seedConnection();
		getCalendarAdapterMock.mockReturnValue({
			stopWatch: vi.fn(),
		});
		stopCalendarConnectionWatchMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			stopped: true,
		});

		const result = await reconcileBoatCalendarConnectionsOnStateChange({
			boatId: "boat-1",
			previousStatus: "active",
			previousIsActive: true,
			nextStatus: "inactive",
			nextIsActive: true,
		});

		expect(result).toMatchObject({
			changed: true,
			action: "disabled",
			totalConnections: 1,
		});
		expect(stopCalendarConnectionWatchMock).toHaveBeenCalledWith({
			connectionId: "conn-1",
		});

		const [updatedConnection] = testDbState.db
			.select()
			.from(boatCalendarConnection)
			.where(eq(boatCalendarConnection.id, "conn-1"))
			.all();
		expect(updatedConnection?.syncStatus).toBe("disabled");
		expect(updatedConnection?.watchChannelId).toBeNull();
		expect(updatedConnection?.watchResourceId).toBeNull();
		expect(updatedConnection?.watchExpiresAt).toBeNull();
	});

	it("re-enables sync, starts watch, and runs catch-up sync on activation", async () => {
		seedConnection({
			syncStatus: "disabled",
			watchChannelId: null,
			watchResourceId: null,
			watchExpiresAt: null,
		});
		getCalendarAdapterMock.mockReturnValue({
			startWatch: vi.fn(),
		});
		startCalendarConnectionWatchMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			watch: {
				channelId: "watch-channel-2",
				resourceId: "watch-resource-2",
			},
		});
		syncCalendarConnectionByIdMock.mockResolvedValue({
			connectionId: "conn-1",
			provider: "google",
			processedEvents: 0,
			nextSyncToken: "tok-2",
			recoveredFromExpiredToken: false,
		});

		const result = await reconcileBoatCalendarConnectionsOnStateChange({
			boatId: "boat-1",
			previousStatus: "inactive",
			previousIsActive: false,
			nextStatus: "active",
			nextIsActive: true,
			webhookUrl: "https://example.test/webhooks/calendar/google",
			webhookChannelToken: "shared-token",
		});

		expect(result).toMatchObject({
			changed: true,
			action: "enabled",
			totalConnections: 1,
		});
		expect(startCalendarConnectionWatchMock).toHaveBeenCalledWith({
			connectionId: "conn-1",
			webhookUrl: "https://example.test/webhooks/calendar/google",
			channelToken: "shared-token",
			ttlSeconds: undefined,
		});
		expect(syncCalendarConnectionByIdMock).toHaveBeenCalledWith("conn-1");

		const [updatedConnection] = testDbState.db
			.select()
			.from(boatCalendarConnection)
			.where(eq(boatCalendarConnection.id, "conn-1"))
			.all();
		expect(updatedConnection?.syncStatus).toBe("idle");
		expect(updatedConnection?.lastError).toBeNull();
	});

	it("keeps watch metadata when stop fails but still marks sync disabled", async () => {
		seedConnection();
		getCalendarAdapterMock.mockReturnValue({
			stopWatch: vi.fn(),
		});
		stopCalendarConnectionWatchMock.mockRejectedValue(
			new Error("calendar stop failed")
		);

		const result = await reconcileBoatCalendarConnectionsOnStateChange({
			boatId: "boat-1",
			previousStatus: "active",
			previousIsActive: true,
			nextStatus: "inactive",
			nextIsActive: true,
		});

		expect(result).toMatchObject({
			changed: true,
			action: "disabled",
		});

		const [updatedConnection] = testDbState.db
			.select()
			.from(boatCalendarConnection)
			.where(eq(boatCalendarConnection.id, "conn-1"))
			.all();
		expect(updatedConnection?.syncStatus).toBe("disabled");
		expect(updatedConnection?.watchChannelId).toBe("watch-channel-1");
		expect(updatedConnection?.lastError).toContain("disable_failed:");
	});

	it("is a no-op when boat calendar automation state did not change", async () => {
		seedConnection();
		const result = await reconcileBoatCalendarConnectionsOnStateChange({
			boatId: "boat-1",
			previousStatus: "active",
			previousIsActive: true,
			nextStatus: "active",
			nextIsActive: true,
		});

		expect(result).toEqual({
			changed: false,
			action: "none",
		});
		expect(startCalendarConnectionWatchMock).not.toHaveBeenCalled();
		expect(stopCalendarConnectionWatchMock).not.toHaveBeenCalled();
		expect(syncCalendarConnectionByIdMock).not.toHaveBeenCalled();
	});
});
