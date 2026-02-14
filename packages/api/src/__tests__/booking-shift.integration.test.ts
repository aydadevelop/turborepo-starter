import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { boat, boatPricingProfile } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingPaymentAttempt,
	bookingRefund,
	bookingShiftRequest,
} from "@full-stack-cf-app/db/schema/booking";
import {
	clearTestDatabase,
	createTestDatabase,
} from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
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
	) => Promise.resolve()
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
	requestUrl: "http://localhost:3000/rpc/booking/shiftRequestReviewManaged",
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
	requestUrl: "http://localhost:3000/rpc/booking/shiftRequestCreate",
	requestHostname: "localhost",
	notificationQueue: {
		send: queueSendMock,
	},
};

const seedAuthBoatAndPricing = async (params?: {
	serviceFeePercentage?: number;
	allowShiftRequests?: boolean;
}) => {
	const serviceFeePercentage = params?.serviceFeePercentage ?? 10;
	const allowShiftRequests = params?.allowShiftRequests ?? true;
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
		name: "Shift Boat",
		slug: "shift-boat",
		status: "active",
		isActive: true,
		passengerCapacity: 10,
		minimumHours: 1,
		timezone: "UTC",
		allowShiftRequests,
	});
	await testDbState.db.insert(boatPricingProfile).values({
		id: "profile-default",
		boatId: "boat-1",
		name: "Default",
		currency: "RUB",
		baseHourlyPriceCents: 10_000,
		minimumHours: 1,
		depositPercentage: 0,
		serviceFeePercentage,
		affiliateFeePercentage: 0,
		taxPercentage: 0,
		acquiringFeePercentage: 0,
		validFrom: new Date("2026-01-01T00:00:00.000Z"),
		isDefault: true,
		createdByUserId: "user-manager",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
};

const seedBooking = async (params: {
	id: string;
	startsAt: Date;
	endsAt: Date;
	basePriceCents: number;
	totalPriceCents: number;
}) => {
	await testDbState.db.insert(booking).values({
		id: params.id,
		organizationId: "org-1",
		boatId: "boat-1",
		customerUserId: "user-customer",
		createdByUserId: "user-manager",
		source: "web",
		status: "confirmed",
		paymentStatus: "unpaid",
		calendarSyncStatus: "linked",
		startsAt: params.startsAt,
		endsAt: params.endsAt,
		passengers: 4,
		timezone: "UTC",
		basePriceCents: params.basePriceCents,
		discountAmountCents: 0,
		totalPriceCents: params.totalPriceCents,
		currency: "RUB",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
};

describe("booking shift request integration", () => {
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

	it("applies shift after dual approval and creates pending pay-now adjustment when price increases", async () => {
		await seedAuthBoatAndPricing();
		await seedBooking({
			id: "booking-price-up",
			startsAt: new Date("2026-05-01T10:00:00.000Z"),
			endsAt: new Date("2026-05-01T12:00:00.000Z"),
			basePriceCents: 20_000,
			totalPriceCents: 22_000,
		});

		const createdRequest = await call(
			bookingRouter.shiftRequestCreate,
			{
				bookingId: "booking-price-up",
				startsAt: new Date("2026-05-01T11:00:00.000Z"),
				endsAt: new Date("2026-05-01T14:00:00.000Z"),
			},
			{ context: customerContext }
		);
		expect(createdRequest.status).toBe("pending");
		expect(createdRequest.customerDecision).toBe("approved");
		expect(createdRequest.managerDecision).toBe("pending");
		expect(createdRequest.priceDeltaCents).toBe(11_000);
		expect(createdRequest.payNowDeltaCents).toBe(1000);

		const [unchangedBooking] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-price-up"))
			.limit(1);
		expect(unchangedBooking?.startsAt.toISOString()).toBe(
			"2026-05-01T10:00:00.000Z"
		);

		const appliedRequest = await call(
			bookingRouter.shiftRequestReviewManaged,
			{
				bookingId: "booking-price-up",
				decision: "approve",
				note: "Approved by manager",
			},
			{ context: managerContext }
		);
		expect(appliedRequest.status).toBe("applied");
		expect(appliedRequest.paymentAdjustmentStatus).toBe("pending");
		expect(appliedRequest.paymentAdjustmentAmountCents).toBe(1000);

		const [updatedBooking] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-price-up"))
			.limit(1);
		expect(updatedBooking).toBeDefined();
		expect(updatedBooking?.startsAt.toISOString()).toBe(
			"2026-05-01T11:00:00.000Z"
		);
		expect(updatedBooking?.endsAt.toISOString()).toBe(
			"2026-05-01T14:00:00.000Z"
		);
		expect(updatedBooking?.basePriceCents).toBe(30_000);
		expect(updatedBooking?.totalPriceCents).toBe(33_000);

		const paymentAdjustments = await testDbState.db
			.select()
			.from(bookingPaymentAttempt)
			.where(eq(bookingPaymentAttempt.bookingId, "booking-price-up"));
		expect(paymentAdjustments).toHaveLength(1);
		expect(paymentAdjustments[0]?.provider).toBe("shift_adjustment");
		expect(paymentAdjustments[0]?.status).toBe("initiated");
		expect(paymentAdjustments[0]?.amountCents).toBe(1000);
	});

	it("creates automatic refund adjustment when shift makes booking cheaper", async () => {
		await seedAuthBoatAndPricing();
		await seedBooking({
			id: "booking-price-down",
			startsAt: new Date("2026-05-01T16:00:00.000Z"),
			endsAt: new Date("2026-05-01T20:00:00.000Z"),
			basePriceCents: 40_000,
			totalPriceCents: 44_000,
		});

		const createdRequest = await call(
			bookingRouter.shiftRequestCreate,
			{
				bookingId: "booking-price-down",
				startsAt: new Date("2026-05-01T16:00:00.000Z"),
				endsAt: new Date("2026-05-01T18:00:00.000Z"),
			},
			{ context: managerContext }
		);
		expect(createdRequest.managerDecision).toBe("approved");
		expect(createdRequest.customerDecision).toBe("pending");
		expect(createdRequest.payNowDeltaCents).toBe(-2000);

		const appliedRequest = await call(
			bookingRouter.shiftRequestReviewMine,
			{
				bookingId: "booking-price-down",
				decision: "approve",
			},
			{ context: customerContext }
		);
		expect(appliedRequest.status).toBe("applied");
		expect(appliedRequest.paymentAdjustmentStatus).toBe("refunded");
		expect(appliedRequest.paymentAdjustmentAmountCents).toBe(2000);

		const [updatedBooking] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-price-down"))
			.limit(1);
		expect(updatedBooking?.basePriceCents).toBe(20_000);
		expect(updatedBooking?.totalPriceCents).toBe(22_000);
		expect(updatedBooking?.refundAmountCents).toBe(2000);

		const refunds = await testDbState.db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, "booking-price-down"));
		expect(refunds).toHaveLength(1);
		expect(refunds[0]?.provider).toBe("shift_adjustment_auto");
		expect(refunds[0]?.status).toBe("processed");
		expect(refunds[0]?.amountCents).toBe(2000);
	});

	it("does not apply shift when one side rejects", async () => {
		await seedAuthBoatAndPricing();
		await seedBooking({
			id: "booking-rejected",
			startsAt: new Date("2026-05-02T08:00:00.000Z"),
			endsAt: new Date("2026-05-02T10:00:00.000Z"),
			basePriceCents: 20_000,
			totalPriceCents: 22_000,
		});

		await call(
			bookingRouter.shiftRequestCreate,
			{
				bookingId: "booking-rejected",
				startsAt: new Date("2026-05-02T09:00:00.000Z"),
				endsAt: new Date("2026-05-02T11:00:00.000Z"),
			},
			{ context: customerContext }
		);

		const rejectedRequest = await call(
			bookingRouter.shiftRequestReviewManaged,
			{
				bookingId: "booking-rejected",
				decision: "reject",
				note: "Owner cannot support this shift",
			},
			{ context: managerContext }
		);
		expect(rejectedRequest.status).toBe("rejected");
		expect(rejectedRequest.rejectionReason).toBe(
			"Owner cannot support this shift"
		);

		const [unchangedBooking] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-rejected"))
			.limit(1);
		expect(unchangedBooking?.startsAt.toISOString()).toBe(
			"2026-05-02T08:00:00.000Z"
		);
		expect(unchangedBooking?.endsAt.toISOString()).toBe(
			"2026-05-02T10:00:00.000Z"
		);

		const [storedRequest] = await testDbState.db
			.select()
			.from(bookingShiftRequest)
			.where(eq(bookingShiftRequest.bookingId, "booking-rejected"))
			.limit(1);
		expect(storedRequest?.status).toBe("rejected");
		expect(storedRequest?.appliedAt).toBeNull();
	});

	it("cancels shift when slot becomes unavailable before final approval", async () => {
		await seedAuthBoatAndPricing();
		await seedBooking({
			id: "booking-late-conflict",
			startsAt: new Date("2026-05-02T12:00:00.000Z"),
			endsAt: new Date("2026-05-02T14:00:00.000Z"),
			basePriceCents: 20_000,
			totalPriceCents: 22_000,
		});

		const createdRequest = await call(
			bookingRouter.shiftRequestCreate,
			{
				bookingId: "booking-late-conflict",
				startsAt: new Date("2026-05-02T15:00:00.000Z"),
				endsAt: new Date("2026-05-02T17:00:00.000Z"),
			},
			{ context: customerContext }
		);
		expect(createdRequest.status).toBe("pending");
		expect(createdRequest.customerDecision).toBe("approved");
		expect(createdRequest.managerDecision).toBe("pending");

		await testDbState.db.insert(booking).values({
			id: "booking-late-conflict-blocker",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-manager",
			createdByUserId: "user-manager",
			source: "manual",
			status: "confirmed",
			paymentStatus: "unpaid",
			calendarSyncStatus: "linked",
			startsAt: new Date("2026-05-02T16:00:00.000Z"),
			endsAt: new Date("2026-05-02T18:00:00.000Z"),
			passengers: 2,
			timezone: "UTC",
			basePriceCents: 20_000,
			discountAmountCents: 0,
			totalPriceCents: 22_000,
			currency: "RUB",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const cancelledRequest = await call(
			bookingRouter.shiftRequestReviewManaged,
			{
				bookingId: "booking-late-conflict",
				decision: "approve",
				note: "Approving requested shift",
			},
			{ context: managerContext }
		);
		expect(cancelledRequest.status).toBe("cancelled");
		expect(cancelledRequest.rejectionReason).toBe(
			"Shift request cancelled because proposed slot is no longer available"
		);
		expect(cancelledRequest.appliedAt).toBeNull();
		expect(cancelledRequest.paymentAdjustmentStatus).toBe("none");
		expect(cancelledRequest.paymentAdjustmentAmountCents).toBe(0);

		const [unchangedBooking] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-late-conflict"))
			.limit(1);
		expect(unchangedBooking?.startsAt.toISOString()).toBe(
			"2026-05-02T12:00:00.000Z"
		);
		expect(unchangedBooking?.endsAt.toISOString()).toBe(
			"2026-05-02T14:00:00.000Z"
		);

		const paymentAdjustments = await testDbState.db
			.select()
			.from(bookingPaymentAttempt)
			.where(eq(bookingPaymentAttempt.bookingId, "booking-late-conflict"));
		expect(paymentAdjustments).toHaveLength(0);

		const refunds = await testDbState.db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, "booking-late-conflict"));
		expect(refunds).toHaveLength(0);
	});

	it("skips tiny pay-now adjustments (<100 cents) but still applies full owner/base delta", async () => {
		await seedAuthBoatAndPricing({
			serviceFeePercentage: 1,
		});
		await seedBooking({
			id: "booking-tiny-delta",
			startsAt: new Date("2026-05-03T10:00:00.000Z"),
			endsAt: new Date("2026-05-03T12:00:00.000Z"),
			basePriceCents: 20_000,
			totalPriceCents: 20_200,
		});

		const createdRequest = await call(
			bookingRouter.shiftRequestCreate,
			{
				bookingId: "booking-tiny-delta",
				startsAt: new Date("2026-05-03T10:00:00.000Z"),
				endsAt: new Date("2026-05-03T12:30:00.000Z"),
			},
			{ context: customerContext }
		);
		expect(createdRequest.priceDeltaCents).toBe(5_050);
		expect(createdRequest.payNowDeltaCents).toBe(50);

		const appliedRequest = await call(
			bookingRouter.shiftRequestReviewManaged,
			{
				bookingId: "booking-tiny-delta",
				decision: "approve",
			},
			{ context: managerContext }
		);
		expect(appliedRequest.status).toBe("applied");
		expect(appliedRequest.paymentAdjustmentStatus).toBe("none");
		expect(appliedRequest.paymentAdjustmentAmountCents).toBe(0);

		const [updatedBooking] = await testDbState.db
			.select()
			.from(booking)
			.where(eq(booking.id, "booking-tiny-delta"))
			.limit(1);
		expect(updatedBooking).toBeDefined();
		expect(updatedBooking?.basePriceCents).toBe(25_000);
		expect(updatedBooking?.totalPriceCents).toBe(25_250);

		const paymentAdjustments = await testDbState.db
			.select()
			.from(bookingPaymentAttempt)
			.where(eq(bookingPaymentAttempt.bookingId, "booking-tiny-delta"));
		expect(paymentAdjustments).toHaveLength(0);

		const refunds = await testDbState.db
			.select()
			.from(bookingRefund)
			.where(eq(bookingRefund.bookingId, "booking-tiny-delta"));
		expect(refunds).toHaveLength(0);
	});

	it("rejects shift request when boat does not accept shifts", async () => {
		await seedAuthBoatAndPricing({
			allowShiftRequests: false,
		});
		await seedBooking({
			id: "booking-shift-disabled",
			startsAt: new Date("2026-05-03T10:00:00.000Z"),
			endsAt: new Date("2026-05-03T12:00:00.000Z"),
			basePriceCents: 20_000,
			totalPriceCents: 22_000,
		});

		await expect(
			call(
				bookingRouter.shiftRequestCreate,
				{
					bookingId: "booking-shift-disabled",
					startsAt: new Date("2026-05-03T11:00:00.000Z"),
					endsAt: new Date("2026-05-03T13:00:00.000Z"),
				},
				{ context: customerContext }
			)
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("rejects customer shift request that is too close to start time", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-05-03T09:30:00.000Z"));
			await seedAuthBoatAndPricing();
			await seedBooking({
				id: "booking-shift-too-late",
				startsAt: new Date("2026-05-03T10:30:00.000Z"),
				endsAt: new Date("2026-05-03T12:30:00.000Z"),
				basePriceCents: 20_000,
				totalPriceCents: 22_000,
			});

			await expect(
				call(
					bookingRouter.shiftRequestCreate,
					{
						bookingId: "booking-shift-too-late",
						startsAt: new Date("2026-05-03T11:00:00.000Z"),
						endsAt: new Date("2026-05-03T13:00:00.000Z"),
					},
					{ context: customerContext }
				)
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
