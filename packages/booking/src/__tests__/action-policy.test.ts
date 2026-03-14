import { describe, expect, it } from "vitest";
import {
	type BookingActionPolicy,
	defaultBookingActionWindowPolicyProfile,
	evaluateBookingActionWindow,
	resolveBookingActionWindowPolicyProfile,
} from "../action-policy";

describe("evaluateBookingActionWindow", () => {
	const now = new Date("2025-06-01T10:00:00Z");

	it("allows customer cancellation when booking is 2 hours away (threshold is 0)", () => {
		const bookingStartsAt = new Date("2025-06-01T12:00:00Z");
		const result = evaluateBookingActionWindow({
			action: "cancellation",
			actor: "customer",
			bookingStartsAt,
			policyProfile: defaultBookingActionWindowPolicyProfile,
			now,
		});
		expect(result.allowed).toBe(true);
		expect(result.hoursUntilStart).toBeCloseTo(2);
		expect(result.minHoursRequired).toBe(0);
	});

	it("allows customer cancellation at exactly 0 hours (threshold is 0)", () => {
		const result = evaluateBookingActionWindow({
			action: "cancellation",
			actor: "customer",
			bookingStartsAt: now,
			policyProfile: defaultBookingActionWindowPolicyProfile,
			now,
		});
		expect(result.allowed).toBe(true);
	});

	it("denies customer shift with only 1 hour remaining (threshold is 2)", () => {
		const bookingStartsAt = new Date("2025-06-01T11:00:00Z");
		const result = evaluateBookingActionWindow({
			action: "shift",
			actor: "customer",
			bookingStartsAt,
			policyProfile: defaultBookingActionWindowPolicyProfile,
			now,
		});
		expect(result.allowed).toBe(false);
		expect(result.hoursUntilStart).toBeCloseTo(1);
		expect(result.minHoursRequired).toBe(2);
	});

	it("allows owner cancellation up to 12 hours after start (threshold is -12)", () => {
		// 10 hours after start = -10 hours until start, which is >= -12
		const bookingStartsAt = new Date("2025-06-01T00:00:00Z");
		const result = evaluateBookingActionWindow({
			action: "cancellation",
			actor: "owner",
			bookingStartsAt,
			policyProfile: defaultBookingActionWindowPolicyProfile,
			now,
		});
		expect(result.allowed).toBe(true);
	});

	it("denies system cancellation more than 24 hours after start (threshold is -24)", () => {
		// booking was 30 hours ago = -30 hours until start
		const bookingStartsAt = new Date("2025-05-31T04:00:00Z");
		const result = evaluateBookingActionWindow({
			action: "cancellation",
			actor: "system",
			bookingStartsAt,
			policyProfile: defaultBookingActionWindowPolicyProfile,
			now,
		});
		expect(result.allowed).toBe(false);
	});

	it("returns correct BookingActionPolicy shape", () => {
		const result: BookingActionPolicy = evaluateBookingActionWindow({
			action: "shift",
			actor: "manager",
			bookingStartsAt: new Date("2025-06-01T12:00:00Z"),
			policyProfile: defaultBookingActionWindowPolicyProfile,
			now,
		});
		expect(result).toHaveProperty("action", "shift");
		expect(result).toHaveProperty("actor", "manager");
		expect(result).toHaveProperty("allowed");
		expect(result).toHaveProperty("hoursUntilStart");
		expect(result).toHaveProperty("minHoursRequired");
	});
});

describe("resolveBookingActionWindowPolicyProfile", () => {
	it("returns default when metadata is null", () => {
		const profile = resolveBookingActionWindowPolicyProfile(null);
		expect(profile).toEqual(defaultBookingActionWindowPolicyProfile);
	});

	it("returns default when metadata has no bookingActionPolicy key", () => {
		const profile = resolveBookingActionWindowPolicyProfile(
			JSON.stringify({ somethingElse: true })
		);
		expect(profile).toEqual(defaultBookingActionWindowPolicyProfile);
	});

	it("applies override when provided", () => {
		const metadata = JSON.stringify({
			bookingActionPolicy: {
				cancellation: { customerLatestHoursBeforeStart: 24 },
			},
		});
		const profile = resolveBookingActionWindowPolicyProfile(metadata);
		expect(profile.cancellation.customerLatestHoursBeforeStart).toBe(24);
		// Other fields unchanged
		expect(profile.shift).toEqual(
			defaultBookingActionWindowPolicyProfile.shift
		);
	});
});
