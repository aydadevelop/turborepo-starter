import { organization, user } from "@my-app/db/schema/auth";
import {
	booking,
	bookingDiscountCode,
	listing,
	listingPricingProfile,
	listingPublication,
	listingTypeConfig,
} from "@my-app/db/schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "@my-app/db/test";
import { applyDiscountToQuote, calculateQuote } from "@my-app/pricing";
import { describe, expect, it } from "vitest";

import {
	preparePromotionPreviewContext,
	previewPreparedPromotionForQuote,
	previewPromotionForQuote,
	recordPromotionUsage,
	resolvePromotionUsageForBooking,
} from "../service";
import type { Db } from "../types";

const ORG_ID = "promo-org";
const USER_ID = "promo-user";
const LISTING_ID = "promo-listing";
const LISTING_TYPE_ID = "promo-listing-type";
const PUBLICATION_ID = "promo-publication";
const DISCOUNT_ID = "promo-discount";

const testDbState = bootstrapTestDatabase({
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Promo Org",
			slug: "promo-org",
		});
		await db.insert(user).values({
			id: USER_ID,
			email: "promo@example.test",
			name: "Promo Customer",
			emailVerified: true,
		});
		await db.insert(listingTypeConfig).values({
			id: LISTING_TYPE_ID,
			slug: "promo-boat-rent",
			label: "Boat rent",
			serviceFamily: "boat_rent",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});
		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: "promo-boat-rent",
			name: "Promo Boat",
			slug: "promo-boat",
			timezone: "UTC",
			minimumDurationMinutes: 60,
			workingHoursStart: 9,
			workingHoursEnd: 18,
			isActive: true,
			status: "active",
		});
		await db.insert(listingPublication).values({
			id: PUBLICATION_ID,
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			channelType: "platform_marketplace",
			isActive: true,
			visibility: "public",
			merchantType: "platform",
		});
		await db.insert(listingPricingProfile).values({
			id: "promo-pricing-profile",
			listingId: LISTING_ID,
			name: "Default pricing",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			minimumHours: 1,
			isDefault: true,
		});
		await db.insert(bookingDiscountCode).values({
			id: DISCOUNT_ID,
			organizationId: ORG_ID,
			code: "SPRING10",
			name: "Spring promo",
			discountType: "percentage",
			discountValue: 10,
			minimumSubtotalCents: 0,
			perCustomerLimit: 1,
			isActive: true,
		});
	},
});

const getDb = () => testDbState.db as unknown as Db;

describe("promotions service", () => {
	it("applies a discount preview to a quote", async () => {
		const db = getDb();
		const quote = await calculateQuote(
			{
				listingId: LISTING_ID,
				startsAt: new Date("2030-01-15T10:00:00.000Z"),
				endsAt: new Date("2030-01-15T12:00:00.000Z"),
			},
			db,
		);

		const preview = await previewPromotionForQuote(
			{
				organizationId: ORG_ID,
				listingId: LISTING_ID,
				discountCode: " spring10 ",
				customerUserId: USER_ID,
				subtotalCents: quote.subtotalCents,
				quote,
			},
			db,
		);

		expect(preview.status).toBe("applied");
		expect(preview.appliedAmountCents).toBe(
			Math.round(quote.subtotalCents * 0.1),
		);
		if (preview.status !== "applied") {
			throw new Error("Expected applied preview");
		}
		expect(preview.quote.discountedTotalCents).toBeLessThan(quote.totalCents);
	});

	it("reuses prepared promotion context across quote previews", async () => {
		const db = getDb();
		const quote = await calculateQuote(
			{
				listingId: LISTING_ID,
				startsAt: new Date("2030-01-15T10:00:00.000Z"),
				endsAt: new Date("2030-01-15T12:00:00.000Z"),
			},
			db,
		);

		const prepared = await preparePromotionPreviewContext(
			{
				organizationId: ORG_ID,
				listingId: LISTING_ID,
				discountCode: "SPRING10",
				customerUserId: USER_ID,
			},
			db,
		);

		const preview = previewPreparedPromotionForQuote(prepared, quote);
		expect(preview.status).toBe("applied");
		expect(preview.appliedAmountCents).toBe(
			Math.round(quote.subtotalCents * 0.1),
		);
	});

	it("returns an invalid preview when the customer limit is exhausted", async () => {
		const db = getDb();
		const quote = await calculateQuote(
			{
				listingId: LISTING_ID,
				startsAt: new Date("2030-01-15T10:00:00.000Z"),
				endsAt: new Date("2030-01-15T12:00:00.000Z"),
			},
			db,
		);

		const claim = await resolvePromotionUsageForBooking(
			{
				organizationId: ORG_ID,
				listingId: LISTING_ID,
				discountCode: "SPRING10",
				customerUserId: USER_ID,
				subtotalCents: quote.subtotalCents,
			},
			db,
		);
		const discountedQuote = applyDiscountToQuote(
			quote,
			claim.application.appliedAmountCents,
		);

		await db.insert(booking).values({
			id: "promo-booking",
			organizationId: ORG_ID,
			listingId: LISTING_ID,
			publicationId: PUBLICATION_ID,
			merchantOrganizationId: ORG_ID,
			source: "web",
			status: "pending",
			startsAt: new Date("2030-01-15T10:00:00.000Z"),
			endsAt: new Date("2030-01-15T12:00:00.000Z"),
			basePriceCents: quote.subtotalCents,
			discountAmountCents: claim.application.appliedAmountCents,
			totalPriceCents: discountedQuote.discountedTotalCents,
			currency: quote.currency,
		});
		await recordPromotionUsage(
			{
				bookingId: "promo-booking",
				customerUserId: USER_ID,
				promotion: claim,
			},
			db,
		);

		const preview = await previewPromotionForQuote(
			{
				organizationId: ORG_ID,
				listingId: LISTING_ID,
				discountCode: "SPRING10",
				customerUserId: USER_ID,
				subtotalCents: quote.subtotalCents,
				quote,
			},
			db,
		);

		expect(preview.status).toBe("invalid");
		expect(preview.reasonCode).toBe("PROMOTION_CODE_CUSTOMER_LIMIT_REACHED");
	});
});
