import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingCancellationRequest,
	bookingPaymentAttempt,
	bookingRefund,
} from "@full-stack-cf-app/db/schema/booking";
import { notificationEvent } from "@full-stack-cf-app/db/schema/notification";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { Context } from "../context";

const testDbState = createTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { bookingRouter } = await import("../routers/booking");

const queueSendMock = vi.fn(
	(
		_message: unknown,
		_options?: {
			contentType?: "text" | "bytes" | "json" | "v8";
			delaySeconds?: number;
		}
	) => {
		return Promise.resolve();
	}
);

const managerContext: Context = {
	session: {
		user: {
			id: "user-manager",
		},
	} as Context["session"],
	activeMembership: {
		organizationId: "org-1",
		role: "manager",
	},
	requestUrl: "http://localhost:3000/rpc/booking/cancelManaged",
	requestHostname: "localhost",
	notificationQueue: {
		send: queueSendMock,
	},
};

const customerContext: Context = {
	session: {
		user: {
			id: "user-customer",
		},
	} as Context["session"],
	activeMembership: null,
	requestUrl: "http://localhost:3000/rpc/booking/cancellationRequestCreate",
	requestHostname: "localhost",
	notificationQueue: {
		send: queueSendMock,
	},
};

const seedAuthAndBoat = async () => {
	await testDbState.db.insert(organization).values({
		id: "org-1",
		name: "Org",
		slug: "org",
	});
	await testDbState.db.insert(user).values([
		{
			id: "user-manager",
			name: "Manager",
			email: "manager@example.test",
			emailVerified: true,
		},
		{
			id: "user-customer",
			name: "Customer",
			email: "customer@example.test",
			emailVerified: true,
		},
	]);
	await testDbState.db.insert(boat).values({
		id: "boat-1",
		organizationId: "org-1",
		name: "Policy Boat",
		slug: "policy-boat",
		status: "active",
		passengerCapacity: 8,
		minimumHours: 1,
		timezone: "UTC",
	});
};

const seedBookingWithCapturedPayment = async (params: {
	bookingId: string;
	startsAt: Date;
	endsAt: Date;
	capturedAmountCents: number;
}) => {
	await testDbState.db.insert(booking).values({
		id: params.bookingId,
		organizationId: "org-1",
		boatId: "boat-1",
		customerUserId: "user-customer",
		createdByUserId: "user-manager",
		source: "web",
		status: "confirmed",
		paymentStatus: "paid",
		calendarSyncStatus: "pending",
		startsAt: params.startsAt,
		endsAt: params.endsAt,
		passengers: 4,
		timezone: "UTC",
		basePriceCents: 10_000,
		discountAmountCents: 0,
		totalPriceCents: 10_000,
		currency: "RUB",
	});
	await testDbState.db.insert(bookingPaymentAttempt).values({
		id: `${params.bookingId}-attempt-1`,
		bookingId: params.bookingId,
		organizationId: "org-1",
		requestedByUserId: "user-customer",
		provider: "mock",
		idempotencyKey: `${params.bookingId}-attempt-1`,
		status: "captured",
		amountCents: params.capturedAmountCents,
		currency: "RUB",
		processedAt: new Date(),
	});
};

describe("booking cancellation policy integration", () => {
	beforeAll(() => {
		testDbState.db.run(sql`PRAGMA foreign_keys = ON`);
	});

	afterAll(() => {
		testDbState.close();
	});

	beforeEach(() => {
		clearTestDatabase(testDbState.db);
		queueSendMock.mockClear();
		vi.useRealTimers();
	});

	it("applies owner cancellation full-refund policy and stays idempotent on re-cancel", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
			await seedAuthAndBoat();
			await seedBookingWithCapturedPayment({
				bookingId: "booking-owner-cancel",
				startsAt: new Date("2026-03-13T10:00:00.000Z"),
				endsAt: new Date("2026-03-13T12:00:00.000Z"),
				capturedAmountCents: 2000,
			});

			const firstCancel = await call(
				bookingRouter.cancelManaged,
				{
					bookingId: "booking-owner-cancel",
					reason: "Owner operational issue",
				},
				{ context: managerContext }
			);
			expect(firstCancel.success).toBe(true);

			const [cancelledBooking] = await testDbState.db
				.select()
				.from(booking)
				.where(eq(booking.id, "booking-owner-cancel"))
				.limit(1);
			expect(cancelledBooking).toBeDefined();
			expect(cancelledBooking?.status).toBe("cancelled");
			expect(cancelledBooking?.calendarSyncStatus).toBe("detached");
			expect(cancelledBooking?.refundAmountCents).toBe(2000);
			expect(cancelledBooking?.paymentStatus).toBe("refunded");

			const refunds = await testDbState.db
				.select()
				.from(bookingRefund)
				.where(eq(bookingRefund.bookingId, "booking-owner-cancel"));
			expect(refunds).toHaveLength(1);
			expect(refunds[0]?.status).toBe("processed");
			expect(refunds[0]?.amountCents).toBe(2000);
			expect(refunds[0]?.provider).toBe("cancellation_policy_auto");

			const events = await testDbState.db
				.select({
					eventType: notificationEvent.eventType,
				})
				.from(notificationEvent)
				.where(eq(notificationEvent.sourceId, "booking-owner-cancel"));
			const eventTypes = new Set(events.map((event) => event.eventType));
			expect(eventTypes.has("booking.cancelled")).toBe(true);
			expect(eventTypes.has("booking.refund.processed")).toBe(true);
			expect(queueSendMock).toHaveBeenCalledTimes(2);

			const secondCancel = await call(
				bookingRouter.cancelManaged,
				{
					bookingId: "booking-owner-cancel",
				},
				{ context: managerContext }
			);
			expect(secondCancel.success).toBe(true);

			const refundsAfterSecondCancel = await testDbState.db
				.select()
				.from(bookingRefund)
				.where(eq(bookingRefund.bookingId, "booking-owner-cancel"));
			expect(refundsAfterSecondCancel).toHaveLength(1);
			expect(queueSendMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("applies customer cancellation partial-refund policy on approval", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
			await seedAuthAndBoat();
			await seedBookingWithCapturedPayment({
				bookingId: "booking-customer-cancel",
				startsAt: new Date("2026-03-10T20:00:00.000Z"),
				endsAt: new Date("2026-03-10T22:00:00.000Z"),
				capturedAmountCents: 2000,
			});

			await call(
				bookingRouter.cancellationRequestCreate,
				{
					bookingId: "booking-customer-cancel",
					reason: "Customer cannot attend",
				},
				{ context: customerContext }
			);

			const approval = await call(
				bookingRouter.cancellationRequestReviewManaged,
				{
					bookingId: "booking-customer-cancel",
					decision: "approve",
					reviewNote: "Approved by manager",
				},
				{ context: managerContext }
			);
			expect(approval.success).toBe(true);

			const [cancelledBooking] = await testDbState.db
				.select()
				.from(booking)
				.where(eq(booking.id, "booking-customer-cancel"))
				.limit(1);
			expect(cancelledBooking).toBeDefined();
			expect(cancelledBooking?.status).toBe("cancelled");
			expect(cancelledBooking?.calendarSyncStatus).toBe("detached");
			expect(cancelledBooking?.refundAmountCents).toBe(1000);
			expect(cancelledBooking?.paymentStatus).toBe("partially_paid");

			const [request] = await testDbState.db
				.select()
				.from(bookingCancellationRequest)
				.where(
					eq(bookingCancellationRequest.bookingId, "booking-customer-cancel")
				)
				.limit(1);
			expect(request?.status).toBe("approved");

			const refunds = await testDbState.db
				.select()
				.from(bookingRefund)
				.where(eq(bookingRefund.bookingId, "booking-customer-cancel"));
			expect(refunds).toHaveLength(1);
			expect(refunds[0]?.status).toBe("processed");
			expect(refunds[0]?.amountCents).toBe(1000);
			expect(refunds[0]?.provider).toBe("cancellation_policy_auto");
			expect(refunds[0]?.metadata).toContain(
				"customer_standard_partial_refund"
			);

			const events = await testDbState.db
				.select({
					eventType: notificationEvent.eventType,
				})
				.from(notificationEvent)
				.where(eq(notificationEvent.sourceId, "booking-customer-cancel"));
			const eventTypes = new Set(events.map((event) => event.eventType));
			expect(eventTypes.has("booking.cancelled")).toBe(true);
			expect(eventTypes.has("booking.refund.processed")).toBe(true);
			expect(queueSendMock).toHaveBeenCalledTimes(2);

			const processedRefundEvents = await testDbState.db
				.select()
				.from(notificationEvent)
				.where(
					and(
						eq(notificationEvent.sourceId, "booking-customer-cancel"),
						eq(notificationEvent.eventType, "booking.refund.processed")
					)
				);
			expect(processedRefundEvents).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("rejects owner safety cancellation without evidence before mutating booking", async () => {
		await seedAuthAndBoat();
		await seedBookingWithCapturedPayment({
			bookingId: "booking-owner-safety",
			startsAt: new Date("2026-03-12T10:00:00.000Z"),
			endsAt: new Date("2026-03-12T12:00:00.000Z"),
			capturedAmountCents: 2000,
		});

		await expect(
			call(
				bookingRouter.cancelManaged,
				{
					bookingId: "booking-owner-safety",
					reason: "Safety policy rejection",
					reasonCode: "OWNER_SAFETY_REJECTION",
				},
				{ context: managerContext }
			)
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		const [bookingAfterFailure] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-owner-safety"))
			.limit(1);
		expect(bookingAfterFailure?.status).toBe("confirmed");
		expect(bookingAfterFailure?.refundAmountCents).toBeNull();

		const refunds = await testDbState.db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, "booking-owner-safety"));
		expect(refunds).toHaveLength(0);
	});

	it("uses structured cancellation request reason metadata during approval", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-03-10T10:00:00.000Z"));
			await seedAuthAndBoat();
			await seedBookingWithCapturedPayment({
				bookingId: "booking-customer-health",
				startsAt: new Date("2026-03-10T20:00:00.000Z"),
				endsAt: new Date("2026-03-10T22:00:00.000Z"),
				capturedAmountCents: 2000,
			});

			await call(
				bookingRouter.cancellationRequestCreate,
				{
					bookingId: "booking-customer-health",
					reason: "Medical issue",
					reasonCode: "CUSTOMER_HEALTH_ISSUE",
				},
				{ context: customerContext }
			);

			const managedRequests = await call(
				bookingRouter.cancellationRequestListManaged,
				{
					limit: 50,
				},
				{ context: managerContext }
			);
			expect(managedRequests).toHaveLength(1);
			expect(managedRequests[0]?.reason).toBe("Medical issue");

			const approval = await call(
				bookingRouter.cancellationRequestReviewManaged,
				{
					bookingId: "booking-customer-health",
					decision: "approve",
					reviewNote: "Approved",
				},
				{ context: managerContext }
			);
			expect(approval.success).toBe(true);

			const [updatedBooking] = await testDbState.db
				.select()
				.from(booking)
				.where(eq(booking.id, "booking-customer-health"))
				.limit(1);
			expect(updatedBooking?.status).toBe("cancelled");
			expect(updatedBooking?.refundAmountCents).toBe(2000);
			expect(updatedBooking?.paymentStatus).toBe("refunded");

			const [refund] = await testDbState.db
				.select()
				.from(bookingRefund)
				.where(eq(bookingRefund.bookingId, "booking-customer-health"))
				.limit(1);
			expect(refund?.metadata).toContain("CUSTOMER_HEALTH_ISSUE");
			expect(refund?.metadata).toContain("reason_override_refund");
		} finally {
			vi.useRealTimers();
		}
	});
});
