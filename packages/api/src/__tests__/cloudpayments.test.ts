import { organization } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCalendarLink,
	bookingPaymentAttempt,
} from "@full-stack-cf-app/db/schema/booking";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { eq, sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const testDbState = createTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const syncCalendarLinkOnBookingUpdateMock = vi.fn();
vi.mock("../routers/booking/services/calendar-sync", () => ({
	syncCalendarLinkOnBookingUpdate: syncCalendarLinkOnBookingUpdateMock,
}));

const { CloudPaymentsWebhookAdapter } = await import(
	"../payments/webhooks/cloudpayments"
);
const { WebhookAuthError, WebhookPayloadError } = await import(
	"../payments/webhooks/errors"
);

const adapter = new CloudPaymentsWebhookAdapter({
	publicId: "pk_test",
	apiSecret: "api_secret",
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const seedBase = () => {
	testDbState.db
		.insert(organization)
		.values({ id: "org-1", name: "Test Org", slug: "test-org" })
		.run();
	testDbState.db
		.insert(boat)
		.values({
			id: "boat-1",
			organizationId: "org-1",
			name: "Test Boat",
			slug: "test-boat",
			status: "active",
			passengerCapacity: 10,
			minimumHours: 1,
			timezone: "UTC",
		})
		.run();
	testDbState.db
		.insert(booking)
		.values({
			id: "booking-1",
			organizationId: "org-1",
			boatId: "boat-1",
			status: "awaiting_payment",
			paymentStatus: "unpaid",
			startsAt: new Date("2026-03-01T10:00:00Z"),
			endsAt: new Date("2026-03-01T13:00:00Z"),
			basePriceCents: 100_000,
			totalPriceCents: 100_000,
			currency: "RUB",
		})
		.run();
};

const seedAttempt = (
	overrides: Partial<typeof bookingPaymentAttempt.$inferInsert> = {}
) => {
	testDbState.db
		.insert(bookingPaymentAttempt)
		.values({
			id: "attempt-1",
			bookingId: "booking-1",
			organizationId: "org-1",
			provider: "cloudpayments",
			idempotencyKey: "key-1",
			status: "initiated",
			amountCents: 100_000,
			currency: "RUB",
			...overrides,
		})
		.run();
};

const seedCalendarLink = (
	overrides: Partial<typeof bookingCalendarLink.$inferInsert> = {}
) => {
	testDbState.db
		.insert(bookingCalendarLink)
		.values({
			id: "calendar-link-1",
			bookingId: "booking-1",
			provider: "google",
			externalCalendarId: "calendar-1",
			externalEventId: "event-1",
			...overrides,
		})
		.run();
};

const expectDefined = <T>(value: T | undefined, message: string): T => {
	if (value === undefined) {
		throw new Error(message);
	}
	return value;
};

const loadAttempt = () => {
	const [attempt] = testDbState.db
		.select()
		.from(bookingPaymentAttempt)
		.where(eq(bookingPaymentAttempt.id, "attempt-1"))
		.all();

	return expectDefined(attempt, "Expected payment attempt to exist");
};

const loadBooking = () => {
	const [bookingRow] = testDbState.db
		.select()
		.from(booking)
		.where(eq(booking.id, "booking-1"))
		.all();

	return expectDefined(bookingRow, "Expected booking row to exist");
};

const loadCalendarLink = () => {
	const [calendarLink] = testDbState.db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, "booking-1"))
		.all();

	return expectDefined(calendarLink, "Expected calendar link to exist");
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("authenticateWebhook", () => {
	it("accepts valid Basic Auth credentials", () => {
		const credentials = btoa("pk_test:api_secret");
		const request = new Request("https://example.com/webhook", {
			headers: { Authorization: `Basic ${credentials}` },
		});

		expect(() => adapter.authenticateWebhook(request)).not.toThrow();
	});

	it("rejects invalid Basic Auth credentials", () => {
		const credentials = btoa("pk_test:wrong_secret");
		const request = new Request("https://example.com/webhook", {
			headers: { Authorization: `Basic ${credentials}` },
		});

		expect(() => adapter.authenticateWebhook(request)).toThrow(
			WebhookAuthError
		);
	});

	it("rejects missing authentication", () => {
		const request = new Request("https://example.com/webhook");

		expect(() => adapter.authenticateWebhook(request)).toThrow(
			WebhookAuthError
		);
	});

	it("accepts Content-HMAC header as fallback auth", () => {
		const request = new Request("https://example.com/webhook", {
			headers: { "Content-HMAC": "some-hmac-value" },
		});

		expect(() => adapter.authenticateWebhook(request)).not.toThrow();
	});
});

describe("parseWebhookBody", () => {
	it("parses JSON body", async () => {
		const body = {
			TransactionId: 12_345,
			Amount: 1000,
			Currency: "RUB",
			Status: "Completed",
		};

		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		const result = await adapter.parseWebhookBody(request);

		expect(result.TransactionId).toBe(12_345);
		expect(result.Amount).toBe(1000);
		expect(result.Currency).toBe("RUB");
		expect(result.Status).toBe("Completed");
	});

	it("parses form-urlencoded body with numeric coercion", async () => {
		const params = new URLSearchParams({
			TransactionId: "12345",
			Amount: "1000",
			Currency: "RUB",
			Status: "Completed",
			TestMode: "1",
		});

		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params.toString(),
		});

		const result = await adapter.parseWebhookBody(request);

		expect(result.TransactionId).toBe(12_345);
		expect(result.Amount).toBe(1000);
		expect(result.TestMode).toBe(true);
	});

	it("rejects unsupported Content-Type", async () => {
		const request = new Request("https://example.com/webhook", {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: "hello",
		});

		await expect(adapter.parseWebhookBody(request)).rejects.toThrow(
			WebhookPayloadError
		);
	});
});

describe("processWebhook", () => {
	beforeAll(() => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);
	});

	afterAll(() => {
		testDbState.close();
	});

	beforeEach(() => {
		clearTestDatabase(testDbState.db);
		syncCalendarLinkOnBookingUpdateMock.mockReset();
		syncCalendarLinkOnBookingUpdateMock.mockResolvedValue({
			status: "linked",
			calendarLinkUpdate: {},
		});
		seedBase();
	});

	describe("check", () => {
		it("returns code 10 when no attempt is found", async () => {
			const result = await adapter.processWebhook("check", {
				TransactionId: 99_999,
				Amount: 1000,
				Currency: "RUB",
				Status: "Created",
			});

			expect(result.code).toBe(10);
		});

		it("returns code 0 for valid attempt and booking", async () => {
			seedAttempt();

			const result = await adapter.processWebhook("check", {
				TransactionId: 12_345,
				Amount: 1000,
				Currency: "RUB",
				Status: "Created",
				InvoiceId: "booking-1",
			});

			expect(result.code).toBe(0);
		});

		it("returns code 13 for cancelled booking", async () => {
			testDbState.db
				.update(booking)
				.set({ status: "cancelled" })
				.where(eq(booking.id, "booking-1"))
				.run();
			seedAttempt();

			const result = await adapter.processWebhook("check", {
				TransactionId: 12_345,
				Amount: 1000,
				Currency: "RUB",
				Status: "Created",
				InvoiceId: "booking-1",
			});

			expect(result.code).toBe(13);
		});

		it("returns code 13 for already captured attempt", async () => {
			seedAttempt({ status: "captured" });

			const result = await adapter.processWebhook("check", {
				TransactionId: 12_345,
				Amount: 1000,
				Currency: "RUB",
				Status: "Created",
				InvoiceId: "booking-1",
			});

			expect(result.code).toBe(13);
		});

		it("stores TransactionId on attempt during check", async () => {
			seedAttempt();

			await adapter.processWebhook("check", {
				TransactionId: 12_345,
				Amount: 1000,
				Currency: "RUB",
				Status: "Created",
				InvoiceId: "booking-1",
			});

			const attempt = loadAttempt();
			expect(attempt.providerIntentId).toBe("12345");
		});
	});

	describe("pay / confirm", () => {
		it("marks attempt as captured and syncs booking status", async () => {
			seedAttempt({ providerIntentId: "12345" });

			const result = await adapter.processWebhook("pay", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Completed",
				InvoiceId: "booking-1",
			});

			expect(result.code).toBe(0);

			const attempt = loadAttempt();
			expect(attempt.status).toBe("captured");
			expect(attempt.processedAt).toBeTruthy();

			// Booking should be confirmed (payment sync + status transition)
			const bookingRow = loadBooking();
			expect(bookingRow.paymentStatus).toBe("paid");
			expect(bookingRow.status).toBe("confirmed");
		});

		it("returns code 0 idempotently for already captured attempt", async () => {
			seedAttempt({ status: "captured", providerIntentId: "12345" });

			const result = await adapter.processWebhook("pay", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Completed",
			});

			expect(result.code).toBe(0);
		});

		it("returns code 0 when attempt not found", async () => {
			const result = await adapter.processWebhook("pay", {
				TransactionId: 99_999,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Completed",
			});

			expect(result.code).toBe(0);
		});

		it("confirm webhook behaves same as pay", async () => {
			seedAttempt({ providerIntentId: "12345" });

			const result = await adapter.processWebhook("confirm", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Completed",
				InvoiceId: "booking-1",
			});

			expect(result.code).toBe(0);

			const attempt = loadAttempt();
			expect(attempt.status).toBe("captured");
		});

		it("re-syncs linked calendar event marker after successful payment", async () => {
			seedAttempt({ providerIntentId: "12345" });
			seedCalendarLink();
			syncCalendarLinkOnBookingUpdateMock.mockResolvedValue({
				status: "linked",
				calendarLinkUpdate: {
					externalEventVersion: "version-2",
				},
			});

			await adapter.processWebhook("pay", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Completed",
				InvoiceId: "booking-1",
			});

			expect(syncCalendarLinkOnBookingUpdateMock).toHaveBeenCalledTimes(1);
			expect(syncCalendarLinkOnBookingUpdateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					boatName: "Test Boat",
					managedBooking: expect.objectContaining({
						id: "booking-1",
						status: "confirmed",
						paymentStatus: "paid",
					}),
					calendarLink: expect.objectContaining({
						bookingId: "booking-1",
						externalCalendarId: "calendar-1",
						externalEventId: "event-1",
					}),
				})
			);

			const calendarLink = loadCalendarLink();
			expect(calendarLink.externalEventVersion).toBe("version-2");
		});
	});

	describe("fail / cancel", () => {
		it("marks attempt as failed with reason", async () => {
			seedAttempt({ providerIntentId: "12345" });

			const result = await adapter.processWebhook("fail", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Declined",
				Reason: "Insufficient funds",
				ReasonCode: 5051,
			});

			expect(result.code).toBe(0);

			const attempt = loadAttempt();
			expect(attempt.status).toBe("failed");
			expect(attempt.failureReason).toBe("Insufficient funds");
		});

		it("generates reason from StatusCode when Reason is absent", async () => {
			seedAttempt({ providerIntentId: "12345" });

			await adapter.processWebhook("fail", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Declined",
				StatusCode: 5051,
			});

			const attempt = loadAttempt();
			expect(attempt.failureReason).toBe("Declined (code: 5051)");
		});

		it("skips update for already captured attempt", async () => {
			seedAttempt({ status: "captured", providerIntentId: "12345" });

			const result = await adapter.processWebhook("fail", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Declined",
			});

			expect(result.code).toBe(0);

			const attempt = loadAttempt();
			expect(attempt.status).toBe("captured");
		});

		it("cancel webhook marks attempt failed", async () => {
			seedAttempt({ providerIntentId: "12345" });

			await adapter.processWebhook("cancel", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Cancelled",
				Reason: "User cancelled",
			});

			const attempt = loadAttempt();
			expect(attempt.status).toBe("failed");
			expect(attempt.failureReason).toBe("User cancelled");
		});
	});

	describe("refund", () => {
		it("marks captured attempt as refunded and syncs booking", async () => {
			seedAttempt({ status: "captured", providerIntentId: "12345" });

			const result = await adapter.processWebhook("refund", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Refunded",
			});

			expect(result.code).toBe(0);

			const attempt = loadAttempt();
			expect(attempt.status).toBe("refunded");

			// Booking payment status should reflect refund
			const bookingRow = loadBooking();
			expect(["refunded", "unpaid"]).toContain(bookingRow.paymentStatus);
		});

		it("skips refund for non-captured attempt", async () => {
			seedAttempt({ providerIntentId: "12345" });

			const result = await adapter.processWebhook("refund", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Refunded",
			});

			expect(result.code).toBe(0);

			const attempt = loadAttempt();
			expect(attempt.status).toBe("initiated");
		});

		it("returns code 0 idempotently for already refunded attempt", async () => {
			seedAttempt({ status: "refunded", providerIntentId: "12345" });

			const result = await adapter.processWebhook("refund", {
				TransactionId: 12_345,
				Amount: 100_000,
				Currency: "RUB",
				Status: "Refunded",
			});

			expect(result.code).toBe(0);
		});
	});
});
