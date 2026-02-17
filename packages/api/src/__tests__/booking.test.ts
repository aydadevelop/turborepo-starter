import { describe, expect, it } from "vitest";

import {
	createBookingPaymentAttemptInputSchema,
	createManagedBookingInputSchema,
	createPublicBookingInputSchema,
	getPublicBookingQuoteInputSchema,
	getPublicCheckoutReadModelInputSchema,
	isValidDiscountCode,
	listAffiliateBookingsInputSchema,
	listManagedBookingPaymentAttemptsInputSchema,
	listManagedBookingsInputSchema,
	listMineBookingDisputesInputSchema,
	listMineBookingPaymentAttemptsInputSchema,
	listMineBookingRefundsInputSchema,
	listPublicBoatAvailabilityInputSchema,
	normalizeDiscountCode,
	processBookingRefundInputSchema,
	processManagedBookingPaymentAttemptInputSchema,
	requestBookingCancellationInputSchema,
	requestBookingRefundInputSchema,
	reviewBookingCancellationInputSchema,
	upsertManagedDiscountCodeInputSchema,
} from "../contracts/booking";

describe("booking router schemas", () => {
	it("normalizes discount codes", () => {
		const code = normalizeDiscountCode("  spring-25 ");

		expect(code).toBe("SPRING-25");
		expect(isValidDiscountCode(code)).toBe(true);
	});

	it("rejects invalid booking time ranges", () => {
		const result = createManagedBookingInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-02-10T12:00:00.000Z",
			endsAt: "2026-02-10T10:00:00.000Z",
			passengers: 4,
			basePriceCents: 120_000,
			calendarLink: {
				provider: "google",
				externalEventId: "event-1",
			},
		});

		expect(result.success).toBe(false);
	});

	it("accepts valid booking payload", () => {
		const result = createManagedBookingInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-02-10T10:00:00.000Z",
			endsAt: "2026-02-10T13:00:00.000Z",
			passengers: 4,
			basePriceCents: 120_000,
			calendarLink: {
				provider: "google",
				externalEventId: "event-2",
			},
			discountCode: "welcome10",
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected schema validation to succeed");
		}
		expect(result.data.currency).toBe("RUB");
	});

	it("rejects percentage discount above 100", () => {
		const result = upsertManagedDiscountCodeInputSchema.safeParse({
			code: "BIG150",
			name: "Too big",
			discountType: "percentage",
			discountValue: 150,
		});

		expect(result.success).toBe(false);
	});

	it("accepts fixed discount code payload", () => {
		const result = upsertManagedDiscountCodeInputSchema.safeParse({
			code: "FLAT500",
			name: "Flat 500",
			discountType: "fixed_cents",
			discountValue: 500,
			minimumSubtotalCents: 1000,
		});

		expect(result.success).toBe(true);
	});

	it("rejects public booking when no contact phone/email is provided", () => {
		const result = createPublicBookingInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 3,
			contactName: "John Doe",
		});

		expect(result.success).toBe(false);
	});

	it("accepts public booking with contact email", () => {
		const result = createPublicBookingInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 3,
			contactName: "John Doe",
			contactEmail: "john@example.com",
		});

		expect(result.success).toBe(true);
	});

	it("rejects invalid public availability time ranges", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			startsAt: "2026-03-10T12:00:00.000Z",
			endsAt: "2026-03-10T10:00:00.000Z",
			passengers: 2,
		});

		expect(result.success).toBe(false);
	});

	it("rejects invalid public availability min/max price ranges", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 2,
			minEstimatedTotalCents: 10_000,
			maxEstimatedTotalCents: 9000,
		});

		expect(result.success).toBe(false);
	});

	it("accepts public availability with boatId and includeUnavailable", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 2,
			boatId: "boat-123",
			includeUnavailable: true,
			offset: 10,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected schema validation to succeed");
		}
		expect(result.data.boatId).toBe("boat-123");
		expect(result.data.includeUnavailable).toBe(true);
		expect(result.data.offset).toBe(10);
	});

	it("accepts public availability in date+duration mode", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			date: "2026-03-10",
			durationHours: 2,
			passengers: 2,
			withSlots: true,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected date+duration mode to validate");
		}
		expect(result.data.date).toBe("2026-03-10");
		expect(result.data.durationHours).toBe(2);
		expect(result.data.withSlots).toBe(true);
	});

	it("accepts public availability with legacy availability band sort", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			date: "2026-03-10",
			durationHours: 2,
			passengers: 2,
			sortBy: "availability_bands",
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected availability_bands sort option to validate");
		}
		expect(result.data.sortBy).toBe("availability_bands");
	});

	it("rejects public availability when both range mode and date mode are provided", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			date: "2026-03-10",
			durationHours: 2,
			passengers: 2,
		});

		expect(result.success).toBe(false);
	});

	it("rejects public availability when no time mode is provided", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			passengers: 2,
		});

		expect(result.success).toBe(false);
	});

	it("defaults public availability offset and includeUnavailable", () => {
		const result = listPublicBoatAvailabilityInputSchema.safeParse({
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 2,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected schema validation to succeed");
		}
		expect(result.data.offset).toBe(0);
		expect(result.data.includeUnavailable).toBe(false);
	});

	it("accepts managed bookings with all new filter params", () => {
		const result = listManagedBookingsInputSchema.safeParse({
			boatId: "boat-1",
			status: "confirmed",
			paymentStatus: "paid",
			source: "web",
			customerUserId: "user-1",
			calendarSyncStatus: "linked",
			search: "John",
			sortBy: "createdAt",
			sortOrder: "asc",
			offset: 20,
			limit: 10,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected schema validation to succeed");
		}
		expect(result.data.paymentStatus).toBe("paid");
		expect(result.data.source).toBe("web");
		expect(result.data.sortBy).toBe("createdAt");
		expect(result.data.sortOrder).toBe("asc");
		expect(result.data.offset).toBe(20);
	});

	it("defaults managed bookings sort and pagination", () => {
		const result = listManagedBookingsInputSchema.safeParse({});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected schema validation to succeed");
		}
		expect(result.data.sortBy).toBe("startsAt");
		expect(result.data.sortOrder).toBe("desc");
		expect(result.data.offset).toBe(0);
	});

	it("rejects managed bookings with invalid search length", () => {
		const result = listManagedBookingsInputSchema.safeParse({
			search: "a".repeat(121),
		});

		expect(result.success).toBe(false);
	});

	it("accepts public booking quote request", () => {
		const result = getPublicBookingQuoteInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 2,
			discountCode: "SPRING_10",
		});

		expect(result.success).toBe(true);
	});

	it("accepts public checkout read model request with locale", () => {
		const result = getPublicCheckoutReadModelInputSchema.safeParse({
			boatId: "boat-1",
			startsAt: "2026-03-10T10:00:00.000Z",
			endsAt: "2026-03-10T12:00:00.000Z",
			passengers: 2,
			locale: "de-DE",
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected checkout read model input to validate");
		}
		expect(result.data.locale).toBe("de-DE");
	});

	it("accepts valid cancellation review decision", () => {
		const result = reviewBookingCancellationInputSchema.safeParse({
			bookingId: "booking-1",
			decision: "approve",
			reviewNote: "Reviewed by manager",
		});

		expect(result.success).toBe(true);
	});

	it("accepts cancellation request with structured reason metadata", () => {
		const result = requestBookingCancellationInputSchema.safeParse({
			bookingId: "booking-1",
			reason: "Health issue",
			reasonCode: "CUSTOMER_HEALTH_ISSUE",
			evidence: [
				{
					type: "document",
					url: "https://example.test/medical-note.pdf",
				},
			],
		});

		expect(result.success).toBe(true);
	});

	it("rejects cancellation metadata with invalid evidence url", () => {
		const result = requestBookingCancellationInputSchema.safeParse({
			bookingId: "booking-1",
			reasonCode: "CUSTOMER_HEALTH_ISSUE",
			evidence: [
				{
					type: "document",
					url: "not-a-url",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	it("validates refund request payload", () => {
		const result = requestBookingRefundInputSchema.safeParse({
			bookingId: "booking-1",
			amountCents: 5000,
			reason: "Weather issue",
		});

		expect(result.success).toBe(true);
	});

	it("requires failure reason when refund processing fails", () => {
		const result = processBookingRefundInputSchema.safeParse({
			refundId: "refund-1",
			status: "failed",
		});

		expect(result.success).toBe(false);
	});

	it("accepts payment attempt creation payload", () => {
		const result = createBookingPaymentAttemptInputSchema.safeParse({
			bookingId: "booking-1",
			idempotencyKey: "idem-payment-001",
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("Expected payment attempt schema validation to succeed");
		}
		expect(result.data.provider).toBe("manual");
		expect(result.data.autoCaptureMock).toBe(false);
		expect(result.data.currency).toBe("RUB");
	});

	it("accepts mock auto-capture payment payload", () => {
		const result = createBookingPaymentAttemptInputSchema.safeParse({
			bookingId: "booking-1",
			idempotencyKey: "idem-payment-mock-001",
			provider: "mock",
			autoCaptureMock: true,
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error(
				"Expected mock auto-capture schema validation to succeed"
			);
		}
		expect(result.data.provider).toBe("mock");
		expect(result.data.autoCaptureMock).toBe(true);
	});

	it("accepts managed payment attempt list payload", () => {
		const result = listManagedBookingPaymentAttemptsInputSchema.safeParse({
			status: "captured",
			limit: 20,
		});

		expect(result.success).toBe(true);
	});

	it("accepts mine payment attempt list payload", () => {
		const result = listMineBookingPaymentAttemptsInputSchema.safeParse({
			bookingId: "booking-1",
			status: "captured",
			limit: 20,
		});

		expect(result.success).toBe(true);
	});

	it("accepts mine dispute list payload", () => {
		const result = listMineBookingDisputesInputSchema.safeParse({
			bookingId: "booking-1",
			status: "open",
			limit: 20,
		});

		expect(result.success).toBe(true);
	});

	it("accepts mine refund list payload", () => {
		const result = listMineBookingRefundsInputSchema.safeParse({
			bookingId: "booking-1",
			status: "requested",
			limit: 20,
		});

		expect(result.success).toBe(true);
	});

	it("accepts affiliate booking list payload", () => {
		const result = listAffiliateBookingsInputSchema.safeParse({
			organizationId: "org-1",
			status: "confirmed",
			sortBy: "createdAt",
			sortOrder: "asc",
			limit: 20,
		});

		expect(result.success).toBe(true);
	});

	it("requires failure reason when payment processing fails", () => {
		const result = processManagedBookingPaymentAttemptInputSchema.safeParse({
			paymentAttemptId: "attempt-1",
			status: "failed",
		});

		expect(result.success).toBe(false);
	});
});
