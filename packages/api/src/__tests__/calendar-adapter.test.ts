import { afterEach, describe, expect, it } from "vitest";

import { FakeCalendarAdapter } from "../calendar/adapters/fake-calendar-adapter";
import {
	getCalendarAdapter,
	registerCalendarAdapter,
	resetCalendarAdapterRegistry,
} from "../calendar/adapters/registry";
import type { CalendarAdapter } from "../calendar/adapters/types";

describe("fake calendar adapter", () => {
	it("creates, updates, and deletes events", async () => {
		const adapter = new FakeCalendarAdapter();

		const created = await adapter.upsertEvent({
			externalCalendarId: "primary",
			title: "Booking #1",
			startsAt: new Date("2026-03-01T10:00:00.000Z"),
			endsAt: new Date("2026-03-01T13:00:00.000Z"),
			timezone: "UTC",
		});

		expect(created.externalEventId).toBeTruthy();
		expect(created.version).toBe("1");

		const updated = await adapter.upsertEvent({
			externalCalendarId: "primary",
			externalEventId: created.externalEventId,
			title: "Booking #1 updated",
			startsAt: new Date("2026-03-01T11:00:00.000Z"),
			endsAt: new Date("2026-03-01T14:00:00.000Z"),
			timezone: "UTC",
		});

		expect(updated.externalEventId).toBe(created.externalEventId);
		expect(updated.version).toBe("2");

		const busyIntervals = await adapter.listBusyIntervals({
			externalCalendarId: "primary",
			from: new Date("2026-03-01T00:00:00.000Z"),
			to: new Date("2026-03-02T00:00:00.000Z"),
		});
		expect(busyIntervals).toHaveLength(1);

		await adapter.deleteEvent({
			externalCalendarId: "primary",
			externalEventId: created.externalEventId,
		});

		const afterDelete = await adapter.listBusyIntervals({
			externalCalendarId: "primary",
			from: new Date("2026-03-01T00:00:00.000Z"),
			to: new Date("2026-03-02T00:00:00.000Z"),
		});
		expect(afterDelete).toHaveLength(0);
	});
});

describe("calendar adapter registry", () => {
	afterEach(() => {
		resetCalendarAdapterRegistry();
	});

	it("has the manual adapter by default", () => {
		expect(getCalendarAdapter("manual")).toBeTruthy();
		expect(getCalendarAdapter("google")).toBeNull();
	});

	it("supports runtime adapter registration", () => {
		const googleAdapter: CalendarAdapter = {
			provider: "google",
			upsertEvent: async () => ({
				externalCalendarId: "calendar-1",
				externalEventId: "event-1",
				syncedAt: new Date("2026-03-05T10:00:00.000Z"),
				version: "1",
			}),
			deleteEvent: async () => Promise.resolve(),
			listBusyIntervals: async () => [],
		};

		registerCalendarAdapter(googleAdapter);

		expect(getCalendarAdapter("google")).toBe(googleAdapter);
	});
});
