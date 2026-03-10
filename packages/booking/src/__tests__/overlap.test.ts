import { describe, expect, it } from "vitest";
import { detectOverlap } from "../overlap";

describe("detectOverlap", () => {
	it("returns true when intervals share a period", () => {
		const a = {
			startsAt: new Date("2025-06-01T10:00:00Z"),
			endsAt: new Date("2025-06-01T14:00:00Z"),
		};
		const b = {
			startsAt: new Date("2025-06-01T12:00:00Z"),
			endsAt: new Date("2025-06-01T16:00:00Z"),
		};
		expect(detectOverlap(a, b)).toBe(true);
	});

	it("returns true when one interval is completely inside the other", () => {
		const a = {
			startsAt: new Date("2025-06-01T10:00:00Z"),
			endsAt: new Date("2025-06-01T18:00:00Z"),
		};
		const b = {
			startsAt: new Date("2025-06-01T12:00:00Z"),
			endsAt: new Date("2025-06-01T14:00:00Z"),
		};
		expect(detectOverlap(a, b)).toBe(true);
	});

	it("returns false when intervals are adjacent (touching ends)", () => {
		const a = {
			startsAt: new Date("2025-06-01T10:00:00Z"),
			endsAt: new Date("2025-06-01T12:00:00Z"),
		};
		const b = {
			startsAt: new Date("2025-06-01T12:00:00Z"),
			endsAt: new Date("2025-06-01T14:00:00Z"),
		};
		expect(detectOverlap(a, b)).toBe(false);
	});

	it("returns false when intervals do not overlap", () => {
		const a = {
			startsAt: new Date("2025-06-01T10:00:00Z"),
			endsAt: new Date("2025-06-01T11:00:00Z"),
		};
		const b = {
			startsAt: new Date("2025-06-01T12:00:00Z"),
			endsAt: new Date("2025-06-01T14:00:00Z"),
		};
		expect(detectOverlap(a, b)).toBe(false);
	});
});
