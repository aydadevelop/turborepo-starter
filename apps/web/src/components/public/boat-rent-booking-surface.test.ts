import { describe, expect, it } from "vitest";
import {
	buildBoatRentBookingRequestInput,
	buildBoatRentBookingSurfaceInput,
	getDisplayedBoatRentQuote,
	normalizeAppliedDiscountCode,
} from "./boat-rent-booking-surface";

describe("boat-rent booking surface helpers", () => {
	it("builds a booking-surface query input with normalized discount codes", () => {
		expect(
			buildBoatRentBookingSurfaceInput({
				listingId: "listing_1",
				selectedDate: "",
				requestedDurationMinutes: 120,
				passengerCount: 4,
				appliedDiscountCode: " spring10 ",
			}),
		).toBeNull();

		expect(
			buildBoatRentBookingSurfaceInput({
				listingId: "listing_1",
				selectedDate: "2030-01-15",
				requestedDurationMinutes: 120,
				passengerCount: 4,
				appliedDiscountCode: " spring10 ",
			}),
		).toEqual({
			listingId: "listing_1",
			date: "2030-01-15",
			durationMinutes: 120,
			passengers: 4,
			discountCode: "SPRING10",
		});
	});

	it("builds a booking mutation payload that preserves the applied discount code", () => {
		expect(
			buildBoatRentBookingRequestInput({
				listingId: "listing_1",
				selectedSlot: null,
				passengers: 4,
				contactName: "Jane Doe",
				contactPhone: "+7 999 000-00-00",
				contactEmail: "jane@example.com",
				timezone: "UTC",
				notes: "Sunset cruise",
				specialRequests: "Champagne",
				discountCode: " save10 ",
			}),
		).toBeNull();

		expect(
			buildBoatRentBookingRequestInput({
				listingId: "listing_1",
				selectedSlot: {
					startsAt: "2030-01-15T10:00:00.000Z",
					endsAt: "2030-01-15T12:00:00.000Z",
					startsAtLabel: "10:00",
					endsAtLabel: "12:00",
					status: "available",
					statusLabel: "Available",
					blockReason: null,
					blockSource: null,
					minimumDurationMinutes: 120,
					quote: {
						listingId: "listing_1",
						profileId: "profile_1",
						currency: "RUB",
						durationMinutes: 120,
						baseCents: 10_000,
						adjustmentCents: 2_000,
						subtotalCents: 12_000,
						serviceFeeCents: 0,
						taxCents: 0,
						totalCents: 12_000,
						hasSpecialPricing: true,
						discountPreview: null,
					},
				},
				passengers: 4,
				contactName: "Jane Doe",
				contactPhone: "+7 999 000-00-00",
				contactEmail: "jane@example.com",
				timezone: "UTC",
				notes: "Sunset cruise",
				specialRequests: "Champagne",
				discountCode: " save10 ",
			}),
		).toEqual({
			listingId: "listing_1",
			startsAt: "2030-01-15T10:00:00.000Z",
			endsAt: "2030-01-15T12:00:00.000Z",
			passengers: 4,
			contactName: "Jane Doe",
			contactPhone: "+7 999 000-00-00",
			contactEmail: "jane@example.com",
			timezone: "UTC",
			notes: "Sunset cruise",
			specialRequests: "Champagne",
			currency: "RUB",
			discountCode: "SAVE10",
		});
	});

	it("prefers discounted totals when a promotion is applied", () => {
		expect(normalizeAppliedDiscountCode("  ")).toBeUndefined();
		expect(normalizeAppliedDiscountCode(" spring10 ")).toBe("SPRING10");

		expect(
			getDisplayedBoatRentQuote({
				listingId: "listing_1",
				profileId: "profile_1",
				currency: "RUB",
				durationMinutes: 120,
				baseCents: 10_000,
				adjustmentCents: 2_000,
				subtotalCents: 12_000,
				serviceFeeCents: 600,
				taxCents: 360,
				totalCents: 12_960,
				hasSpecialPricing: true,
				discountPreview: {
					code: "SPRING10",
					status: "applied",
					reasonCode: null,
					reasonLabel: null,
					appliedAmountCents: 1_200,
					discountedSubtotalCents: 10_800,
					discountedServiceFeeCents: 540,
					discountedTaxCents: 324,
					discountedTotalCents: 11_664,
				},
			}),
		).toEqual({
			appliedDiscountCode: "SPRING10",
			discountAmountCents: 1_200,
			feeAndTaxCents: 864,
			subtotalCents: 10_800,
			totalCents: 11_664,
		});
	});
});
