import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	bookingPaymentAttempt,
	listing,
	listingPublication,
	listingTypeConfig,
	organizationSettings,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { describe, expect, it } from "vitest";

import { applyCancellation, requestCancellation } from "../cancellation-service";
import type { Db } from "../types";

const ORG_ID = "can-org-1";
const APPLIER_USER_ID = "can-applier-user-1";
const LISTING_ID = "can-listing-1";
const PUB_ID = "can-pub-1";
const LISTING_TYPE_SLUG = "can-test-type";

// Bookings seeded for each test case
const BOOKING_FREE_ID = "can-bk-free"; // 30 days away — free window
const BOOKING_PENALTY_ID = "can-bk-penalty"; // 3h away — penalty window
const BOOKING_LATE_ID = "can-bk-late"; // 30min away — late window
const BOOKING_MANAGER_ID = "can-bk-manager"; // 30 days away — manager-initiated
const BOOKING_HEALTH_ID = "can-bk-health"; // 30min away — CUSTOMER_HEALTH_ISSUE override
const BOOKING_SAFETY_ID = "can-bk-safety"; // 30 days away — MANAGER_SAFETY_REJECTION
const BOOKING_NO_PMT_ID = "can-bk-no-pmt"; // 30 days away — no payment attempts
const BOOKING_DUP_ID = "can-bk-dup"; // 30 days away — duplicate request guard

const now = new Date();
const h = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

const testDbState = bootstrapTestDatabase({
	seedStrategy: "beforeAll",
	seed: async (db: TestDatabase) => {
		await db.insert(listingTypeConfig).values({
			id: crypto.randomUUID(),
			slug: LISTING_TYPE_SLUG,
			label: "Cancellation Test Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(user).values({ id: APPLIER_USER_ID, name: "Applier", email: "applier@test.com" });
		await db.insert(organization).values({ id: ORG_ID, name: "Cancel Org", slug: "can-org" });
		// Org settings fallback: free window 24h, penalty 20%
		await db.insert(organizationSettings).values({
			id: crypto.randomUUID(),
			organizationId: ORG_ID,
			cancellationFreeWindowHours: 24,
			cancellationPenaltyBps: 2000, // 20% penalty
		});
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: LISTING_TYPE_SLUG,
			name: "Cancel Listing",
			slug: "can-listing",
		});
		await db.insert(listingPublication).values({
			id: PUB_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "own_site",
		});

		// Helper to create a booking
		const mkBooking = (id: string, startsAt: Date) => ({
			id,
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUB_ID,
			merchantOrganizationId: ORG_ID,
			source: "web" as const,
			status: "confirmed" as const,
			startsAt,
			endsAt: new Date(startsAt.getTime() + 3_600_000),
			basePriceCents: 10_000,
			totalPriceCents: 10_000,
			currency: "RUB",
		});

		await db.insert(booking).values([
			mkBooking(BOOKING_FREE_ID, h(30 * 24)),
			mkBooking(BOOKING_PENALTY_ID, h(3)),
			mkBooking(BOOKING_LATE_ID, h(0.5)),
			mkBooking(BOOKING_MANAGER_ID, h(30 * 24)),
			mkBooking(BOOKING_HEALTH_ID, h(0.5)),
			mkBooking(BOOKING_SAFETY_ID, h(30 * 24)),
			mkBooking(BOOKING_NO_PMT_ID, h(30 * 24)),
			mkBooking(BOOKING_DUP_ID, h(30 * 24)),
		]);

		// Add captured payment attempts for most bookings (10000 cents each)
		const paidBookings = [
			BOOKING_FREE_ID,
			BOOKING_PENALTY_ID,
			BOOKING_LATE_ID,
			BOOKING_MANAGER_ID,
			BOOKING_HEALTH_ID,
			BOOKING_SAFETY_ID,
			BOOKING_DUP_ID,
		];
		await db.insert(bookingPaymentAttempt).values(
			paidBookings.map((bookingId) => ({
				id: crypto.randomUUID(),
				bookingId,
				organizationId: ORG_ID,
				provider: "cloudpayments",
				idempotencyKey: `seed:${bookingId}`,
				providerIntentId: `pi-seed-${bookingId}`,
				status: "captured" as const,
				amountCents: 10_000,
				currency: "RUB",
				processedAt: now,
			})),
		);
		// BOOKING_NO_PMT_ID intentionally has NO payment attempts
	},
});

const getDb = () => testDbState.db as unknown as Db;

describe("requestCancellation — policy outcomes", () => {
	it("customer in free window (30 days away) → 100% refund", async () => {
		const { outcome } = await requestCancellation(
			{ bookingId: BOOKING_FREE_ID, organizationId: ORG_ID, initiatedByRole: "customer" },
			getDb(),
		);

		expect(outcome.refundPercent).toBe(100);
		expect(outcome.suggestedRefundCents).toBe(10_000);
		expect(outcome.policyCode).toBe("customer_early_full_refund");
		expect(outcome.policySource).toBe("default_profile");
	});

	it("customer in penalty window (3h away) → 80% refund (20% penalty)", async () => {
		const { outcome } = await requestCancellation(
			{ bookingId: BOOKING_PENALTY_ID, organizationId: ORG_ID, initiatedByRole: "customer" },
			getDb(),
		);

		expect(outcome.refundPercent).toBe(80); // 100% - 20% penalty
		expect(outcome.suggestedRefundCents).toBe(8_000);
		expect(outcome.policyCode).toBe("customer_standard_partial_refund");
	});

	it("customer in late window (30min away) → 0% refund (100% penalty)", async () => {
		const { outcome } = await requestCancellation(
			{ bookingId: BOOKING_LATE_ID, organizationId: ORG_ID, initiatedByRole: "customer" },
			getDb(),
		);

		expect(outcome.refundPercent).toBe(0); // latePenaltyBps=10_000 → 100% penalty
		expect(outcome.suggestedRefundCents).toBe(0);
		expect(outcome.policyCode).toBe("customer_late_no_refund");
	});

	it("manager-initiated (30 days away) → 100% refund regardless of time window", async () => {
		const { outcome } = await requestCancellation(
			{ bookingId: BOOKING_MANAGER_ID, organizationId: ORG_ID, initiatedByRole: "manager" },
			getDb(),
		);

		expect(outcome.refundPercent).toBe(100);
		expect(outcome.policyCode).toBe("manager_default_full_refund");
	});

	it("CUSTOMER_HEALTH_ISSUE overrides late window to 100% refund", async () => {
		const { outcome } = await requestCancellation(
			{
				bookingId: BOOKING_HEALTH_ID,
				organizationId: ORG_ID,
				initiatedByRole: "customer",
				reasonCode: "CUSTOMER_HEALTH_ISSUE",
			},
			getDb(),
		);

		expect(outcome.refundPercent).toBe(100);
		expect(outcome.policySource).toBe("reason_override");
		expect(outcome.policyCode).toBe("reason_override_refund");
	});
});

describe("requestCancellation — MANAGER_SAFETY_REJECTION", () => {
	it("throws EVIDENCE_REQUIRED without evidence", async () => {
		await expect(() =>
			requestCancellation(
				{
					bookingId: BOOKING_SAFETY_ID,
					organizationId: ORG_ID,
					initiatedByRole: "manager",
					reasonCode: "MANAGER_SAFETY_REJECTION",
				},
				getDb(),
			),
		).rejects.toThrow("EVIDENCE_REQUIRED");
	});

	it("succeeds with evidence and returns refundPercent=0", async () => {
		const { outcome } = await requestCancellation(
			{
				bookingId: BOOKING_SAFETY_ID,
				organizationId: ORG_ID,
				initiatedByRole: "manager",
				reasonCode: "MANAGER_SAFETY_REJECTION",
				evidence: [{ type: "photo", url: "https://example.com/evidence.jpg" }],
			},
			getDb(),
		);

		expect(outcome.refundPercent).toBe(0);
		expect(outcome.policySource).toBe("reason_override");
	});
});

describe("applyCancellation — no captured payments", () => {
	it("no payment attempts → refundableBaseCents=0, applyCancellation skips bookingRefund", async () => {
		const { request, outcome } = await requestCancellation(
			{ bookingId: BOOKING_NO_PMT_ID, organizationId: ORG_ID, initiatedByRole: "customer" },
			getDb(),
		);

		expect(outcome.capturedAmountCents).toBe(0);
		expect(outcome.suggestedRefundCents).toBe(0);

		const { refundId } = await applyCancellation(
			request.id,
			ORG_ID,
			APPLIER_USER_ID,
			getDb(),
		);

		// No refund row should be inserted when refundAmountCents=0
		expect(refundId).toBeNull();
	});
});

describe("requestCancellation — duplicate guard", () => {
	it("throws DUPLICATE_REQUEST on second call for same booking", async () => {
		await requestCancellation(
			{ bookingId: BOOKING_DUP_ID, organizationId: ORG_ID, initiatedByRole: "customer" },
			getDb(),
		);

		await expect(() =>
			requestCancellation(
				{ bookingId: BOOKING_DUP_ID, organizationId: ORG_ID, initiatedByRole: "customer" },
				getDb(),
			),
		).rejects.toThrow("DUPLICATE_REQUEST");
	});
});
