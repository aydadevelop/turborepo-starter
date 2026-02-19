import {
	affiliateReferral,
	bookingAffiliateAttribution,
	bookingAffiliatePayout,
} from "@full-stack-cf-app/db/schema/affiliate";
import { organization, user } from "@full-stack-cf-app/db/schema/auth";
import { boat } from "@full-stack-cf-app/db/schema/boat";
import { booking } from "@full-stack-cf-app/db/schema/booking";
import { bootstrapTestDatabase } from "@full-stack-cf-app/db/test";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createManagedContext, createUserContext } from "./utils/context";

const testDbState = bootstrapTestDatabase();

vi.doMock("@full-stack-cf-app/db", () => ({
	db: testDbState.db,
}));

const { bookingRouter } = await import("../routers/booking");

const managerContext = createManagedContext({
	userId: "user-manager",
	organizationId: "org-1",
	role: "org_owner",
	requestUrl: "http://localhost:3000/rpc/booking/affiliatePayoutListManaged",
});

const affiliateContext = createUserContext({
	userId: "user-affiliate",
	requestUrl: "http://localhost:3000/rpc/booking/listAffiliateMine",
});

const seedBase = async () => {
	await testDbState.db.insert(organization).values({
		id: "org-1",
		name: "Org One",
		slug: "org-one",
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
		{
			id: "user-affiliate",
			name: "Affiliate",
			email: "affiliate@example.test",
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
			id: "booking-eligible",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer",
			createdByUserId: "user-manager",
			source: "web",
			status: "completed",
			paymentStatus: "paid",
			calendarSyncStatus: "linked",
			startsAt: new Date("2026-03-21T10:00:00.000Z"),
			endsAt: new Date("2026-03-21T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 20_000,
			discountAmountCents: 0,
			totalPriceCents: 20_000,
			currency: "RUB",
		},
		{
			id: "booking-pending",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer",
			createdByUserId: "user-manager",
			source: "web",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "linked",
			startsAt: new Date("2026-03-22T10:00:00.000Z"),
			endsAt: new Date("2026-03-22T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 22_000,
			discountAmountCents: 0,
			totalPriceCents: 22_000,
			currency: "RUB",
		},
		{
			id: "booking-cancel-target",
			organizationId: "org-1",
			boatId: "boat-1",
			customerUserId: "user-customer",
			createdByUserId: "user-manager",
			source: "web",
			status: "confirmed",
			paymentStatus: "unpaid",
			calendarSyncStatus: "pending",
			startsAt: new Date("2026-03-23T10:00:00.000Z"),
			endsAt: new Date("2026-03-23T12:00:00.000Z"),
			passengers: 4,
			timezone: "UTC",
			basePriceCents: 24_000,
			discountAmountCents: 0,
			totalPriceCents: 24_000,
			currency: "RUB",
		},
	]);

	await testDbState.db.insert(affiliateReferral).values({
		id: "referral-1",
		code: "AFF_MAIN",
		affiliateUserId: "user-affiliate",
		organizationId: "org-1",
		name: "Main affiliate",
		status: "active",
	});

	await testDbState.db.insert(bookingAffiliateAttribution).values([
		{
			id: "attribution-eligible",
			bookingId: "booking-eligible",
			organizationId: "org-1",
			affiliateUserId: "user-affiliate",
			referralId: "referral-1",
			referralCode: "AFF_MAIN",
			source: "cookie",
			clickedAt: new Date("2026-03-18T10:00:00.000Z"),
		},
		{
			id: "attribution-pending",
			bookingId: "booking-pending",
			organizationId: "org-1",
			affiliateUserId: "user-affiliate",
			referralId: "referral-1",
			referralCode: "AFF_MAIN",
			source: "cookie",
			clickedAt: new Date("2026-03-19T10:00:00.000Z"),
		},
		{
			id: "attribution-cancel-target",
			bookingId: "booking-cancel-target",
			organizationId: "org-1",
			affiliateUserId: "user-affiliate",
			referralId: "referral-1",
			referralCode: "AFF_MAIN",
			source: "cookie",
			clickedAt: new Date("2026-03-20T10:00:00.000Z"),
		},
	]);

	await testDbState.db.insert(bookingAffiliatePayout).values([
		{
			id: "payout-eligible",
			attributionId: "attribution-eligible",
			bookingId: "booking-eligible",
			organizationId: "org-1",
			affiliateUserId: "user-affiliate",
			commissionAmountCents: 2000,
			currency: "RUB",
			status: "pending",
		},
		{
			id: "payout-pending",
			attributionId: "attribution-pending",
			bookingId: "booking-pending",
			organizationId: "org-1",
			affiliateUserId: "user-affiliate",
			commissionAmountCents: 2200,
			currency: "RUB",
			status: "pending",
		},
		{
			id: "payout-cancel-target",
			attributionId: "attribution-cancel-target",
			bookingId: "booking-cancel-target",
			organizationId: "org-1",
			affiliateUserId: "user-affiliate",
			commissionAmountCents: 2400,
			currency: "RUB",
			status: "pending",
		},
	]);
};

describe("booking affiliate payout integration", () => {
	beforeAll(async () => {
		await seedBase();
	});

	it("reconciles payout status in managed and affiliate list views", async () => {
		const [managed, affiliate] = await Promise.all([
			call(
				bookingRouter.affiliatePayoutListManaged,
				{
					limit: 50,
					offset: 0,
				},
				{ context: managerContext }
			),
			call(
				bookingRouter.listAffiliateMine,
				{
					limit: 50,
					offset: 0,
				},
				{ context: affiliateContext }
			),
		]);

		expect(managed.total).toBe(3);
		const eligibleManaged = managed.items.find(
			(item) => item.bookingId === "booking-eligible"
		);
		expect(eligibleManaged?.status).toBe("eligible");
		expect(eligibleManaged?.eligibleAt).not.toBeNull();

		const eligibleAffiliate = affiliate.items.find(
			(item) => item.referralCode === "AFF_MAIN" && item.boatId === "boat-1"
		);
		expect(eligibleAffiliate).toBeDefined();
		expect(affiliate.total).toBe(3);
		expect(
			affiliate.items.some((item) => item.payoutStatus === "eligible")
		).toBe(true);
	});

	it("rejects paying payout before booking becomes eligible", async () => {
		await expect(
			call(
				bookingRouter.affiliatePayoutProcessManaged,
				{
					payoutId: "payout-pending",
					status: "paid",
					externalPayoutRef: "manual-pay-1",
				},
				{ context: managerContext }
			)
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("allows paying eligible payout and prevents voiding after payment", async () => {
		const processed = await call(
			bookingRouter.affiliatePayoutProcessManaged,
			{
				payoutId: "payout-eligible",
				status: "paid",
				externalPayoutRef: "manual-pay-eligible",
			},
			{ context: managerContext }
		);
		expect(processed.success).toBe(true);

		const [payout] = await testDbState.db
			.select()
			.from(bookingAffiliatePayout)
			.where(eq(bookingAffiliatePayout.id, "payout-eligible"))
			.limit(1);

		expect(payout?.status).toBe("paid");
		expect(payout?.externalPayoutRef).toBe("manual-pay-eligible");
		expect(payout?.paidAt).not.toBeNull();

		await expect(
			call(
				bookingRouter.affiliatePayoutProcessManaged,
				{
					payoutId: "payout-eligible",
					status: "voided",
					note: "manual void",
				},
				{ context: managerContext }
			)
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("voids affiliate payout when booking is cancelled", async () => {
		const cancelled = await call(
			bookingRouter.cancelManaged,
			{
				bookingId: "booking-cancel-target",
				reason: "Operator cancelled",
			},
			{ context: managerContext }
		);
		expect(cancelled.success).toBe(true);

		const [payout] = await testDbState.db
			.select()
			.from(bookingAffiliatePayout)
			.where(eq(bookingAffiliatePayout.id, "payout-cancel-target"))
			.limit(1);

		expect(payout?.status).toBe("voided");
		expect(payout?.voidReason).toBe("booking_cancelled");
		expect(payout?.voidedAt).not.toBeNull();
	});
});
