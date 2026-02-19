import {
	affiliateReferral,
	bookingAffiliateAttribution,
	bookingAffiliatePayout,
} from "@full-stack-cf-app/db/schema/affiliate";
import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import {
	booking,
	bookingDispute,
	bookingPaymentAttempt,
	bookingRefund,
} from "@full-stack-cf-app/db/schema/booking";
import { bootstrapTestDatabase } from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createUserContext } from "./utils/context";

const testDbState = bootstrapTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { bookingRouter } = await import("../routers/booking");

const customerAContext = createUserContext({
	userId: "user-customer-a",
	requestUrl: "http://localhost:3000/rpc/booking/disputeListMine",
});

const seedBase = async () => {
	await testDbState.db.insert(organization).values({
		id: "org-1",
		name: "Org One",
		slug: "org-one",
	});
	await testDbState.db.insert(user).values([
		{
			id: "user-operator",
			name: "Operator",
			email: "operator@example.test",
			emailVerified: true,
		},
		{
			id: "user-customer-a",
			name: "Customer A",
			email: "customer-a@example.test",
			emailVerified: true,
		},
		{
			id: "user-customer-b",
			name: "Customer B",
			email: "customer-b@example.test",
			emailVerified: true,
		},
	]);
	await testDbState.db.insert(boat).values({
		id: "boat-1",
		organizationId: "org-1",
		name: "Test Boat",
		slug: "test-boat",
		status: "active",
		passengerCapacity: 10,
		minimumHours: 1,
		timezone: "UTC",
	});

	await testDbState.db.insert(booking).values([
		{
			id: "booking-own",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer-a",
			createdByUserId: "user-operator",
			source: "web",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-20T10:00:00.000Z"),
			endsAt: new Date("2026-03-20T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 20_000,
			discountAmountCents: 0,
			totalPriceCents: 20_000,
			currency: "RUB",
		},
		{
			id: "booking-other",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer-b",
			createdByUserId: "user-operator",
			source: "web",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-21T10:00:00.000Z"),
			endsAt: new Date("2026-03-21T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 25_000,
			discountAmountCents: 0,
			totalPriceCents: 25_000,
			currency: "RUB",
		},
		{
			id: "booking-affiliate",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer-b",
			createdByUserId: "user-customer-a",
			source: "partner",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-22T10:00:00.000Z"),
			endsAt: new Date("2026-03-22T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 30_000,
			discountAmountCents: 0,
			totalPriceCents: 30_000,
			currency: "RUB",
		},
		{
			id: "booking-created-manual",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer-b",
			createdByUserId: "user-customer-a",
			source: "manual",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-23T10:00:00.000Z"),
			endsAt: new Date("2026-03-23T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 28_000,
			discountAmountCents: 0,
			totalPriceCents: 28_000,
			currency: "RUB",
		},
	]);

	await testDbState.db.insert(bookingDispute).values([
		{
			id: "dispute-own",
			bookingId: "booking-own",
			organizationId: "org-1",
			raisedByUserId: "user-customer-a",
			status: "open",
			details: "Own dispute",
		},
		{
			id: "dispute-other",
			bookingId: "booking-other",
			organizationId: "org-1",
			raisedByUserId: "user-customer-b",
			status: "open",
			details: "Other dispute",
		},
	]);

	await testDbState.db.insert(bookingRefund).values([
		{
			id: "refund-own",
			bookingId: "booking-own",
			organizationId: "org-1",
			requestedByUserId: "user-customer-a",
			status: "requested",
			amountCents: 3000,
			currency: "RUB",
			reason: "Own refund",
		},
		{
			id: "refund-other",
			bookingId: "booking-other",
			organizationId: "org-1",
			requestedByUserId: "user-customer-b",
			status: "requested",
			amountCents: 4000,
			currency: "RUB",
			reason: "Other refund",
		},
	]);

	await testDbState.db.insert(bookingPaymentAttempt).values([
		{
			id: "attempt-own",
			bookingId: "booking-own",
			organizationId: "org-1",
			requestedByUserId: "user-customer-a",
			provider: "mock",
			idempotencyKey: "idem-own",
			status: "captured",
			amountCents: 2000,
			currency: "RUB",
			processedAt: new Date("2026-03-20T09:30:00.000Z"),
		},
		{
			id: "attempt-other",
			bookingId: "booking-other",
			organizationId: "org-1",
			requestedByUserId: "user-customer-b",
			provider: "mock",
			idempotencyKey: "idem-other",
			status: "captured",
			amountCents: 2500,
			currency: "RUB",
			processedAt: new Date("2026-03-21T09:30:00.000Z"),
		},
	]);

	await testDbState.db.insert(affiliateReferral).values({
		id: "referral-a",
		code: "AFF_A",
		affiliateUserId: "user-customer-a",
		organizationId: "org-1",
		name: "Affiliate A",
		status: "active",
	});

	await testDbState.db.insert(bookingAffiliateAttribution).values({
		id: "attribution-a",
		bookingId: "booking-affiliate",
		organizationId: "org-1",
		affiliateUserId: "user-customer-a",
		referralId: "referral-a",
		referralCode: "AFF_A",
		source: "cookie",
		clickedAt: new Date("2026-03-19T09:00:00.000Z"),
	});

	await testDbState.db.insert(bookingAffiliatePayout).values({
		id: "payout-a",
		attributionId: "attribution-a",
		bookingId: "booking-affiliate",
		organizationId: "org-1",
		affiliateUserId: "user-customer-a",
		commissionAmountCents: 2500,
		currency: "RUB",
		status: "pending",
	});
};

describe("booking listMine endpoint isolation", () => {
	beforeAll(async () => {
		await seedBase();
	});

	it("returns only current user's disputes, refunds, and payment attempts", async () => {
		const [mineDisputes, mineRefunds, mineAttempts] = await Promise.all([
			call(
				bookingRouter.disputeListMine,
				{
					limit: 50,
				},
				{ context: customerAContext }
			),
			call(
				bookingRouter.refundListMine,
				{
					limit: 50,
				},
				{ context: customerAContext }
			),
			call(
				bookingRouter.paymentAttemptListMine,
				{
					limit: 50,
				},
				{ context: customerAContext }
			),
		]);

		expect(mineDisputes.map((item) => item.id)).toEqual(["dispute-own"]);
		expect(mineRefunds.map((item) => item.id)).toEqual(["refund-own"]);
		expect(mineAttempts.map((item) => item.id)).toEqual(["attempt-own"]);
	});

	it("does not leak records when user filters by another bookingId", async () => {
		const [mineDisputes, mineRefunds, mineAttempts] = await Promise.all([
			call(
				bookingRouter.disputeListMine,
				{
					bookingId: "booking-other",
					limit: 50,
				},
				{ context: customerAContext }
			),
			call(
				bookingRouter.refundListMine,
				{
					bookingId: "booking-other",
					limit: 50,
				},
				{ context: customerAContext }
			),
			call(
				bookingRouter.paymentAttemptListMine,
				{
					bookingId: "booking-other",
					limit: 50,
				},
				{ context: customerAContext }
			),
		]);

		expect(mineDisputes).toHaveLength(0);
		expect(mineRefunds).toHaveLength(0);
		expect(mineAttempts).toHaveLength(0);
	});

	it("returns only attributed bookings for affiliate scope", async () => {
		const affiliateBookings = await call(
			bookingRouter.listAffiliateMine,
			{
				limit: 50,
			},
			{ context: customerAContext }
		);

		expect(affiliateBookings.total).toBe(1);
		expect(affiliateBookings.items).toHaveLength(1);
		const [item] = affiliateBookings.items;
		if (!item) {
			throw new Error("Expected one affiliate booking item");
		}

		expect(item.boatId).toBe("boat-1");
		expect(item.boatName).toBe("Test Boat");
		expect(item.status).toBe("confirmed");
		expect(item.paymentStatus).toBe("paid");
		expect(item.bookingRef).toContain("BKG-");
		expect(item.bookingRef).not.toContain("booking-affiliate");
		expect(item.customerRef).toContain("CUS-");
		expect(item.customerRef).not.toContain("user-customer-b");
		expect(item.referralCode).toBe("AFF_A");
		expect(item.commissionAmountCents).toBe(2500);
		expect(item.commissionCurrency).toBe("RUB");
		expect(item.payoutStatus).toBe("pending");
		expect(item.payoutEligibleAt).toBeNull();
		expect((item as Record<string, unknown>).contactEmail).toBeUndefined();
		expect((item as Record<string, unknown>).contactPhone).toBeUndefined();
		expect((item as Record<string, unknown>).contactName).toBeUndefined();
	});
});
