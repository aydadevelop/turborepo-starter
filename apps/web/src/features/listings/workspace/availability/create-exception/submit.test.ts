import { describe, expect, it } from "vitest";

import { buildCreateAvailabilityExceptionInput } from "./submit";

describe("buildCreateAvailabilityExceptionInput", () => {
	it("maps a full-day unavailable exception into the oRPC input shape", () => {
		expect(
			buildCreateAvailabilityExceptionInput("listing-1", {
				date: "2026-06-02",
				isAvailable: false,
				startTime: "",
				endTime: "",
				reason: "Storm warning",
			}),
		).toEqual({
			ok: true,
			data: {
				listingId: "listing-1",
				date: "2026-06-02",
				isAvailable: false,
				reason: "Storm warning",
			},
		});
	});

	it("maps a partial-day available exception into the oRPC input shape", () => {
		expect(
			buildCreateAvailabilityExceptionInput("listing-1", {
				date: "2026-06-03",
				isAvailable: true,
				startTime: "12:00",
				endTime: "16:30",
				reason: "Late departure",
			}),
		).toEqual({
			ok: true,
			data: {
				listingId: "listing-1",
				date: "2026-06-03",
				isAvailable: true,
				startMinute: 720,
				endMinute: 990,
				reason: "Late departure",
			},
		});
	});
});
