import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organization } from "../schema/auth";
import {
	listingAvailabilityBlock,
	listingAvailabilityException,
	listingAvailabilityRule,
	listingCalendarConnection,
} from "../schema/availability";
import {
	listing,
	listingAsset,
	listingPricingProfile,
	listingTypeConfig,
	organizationListingType,
	organizationOnboarding,
	organizationPaymentConfig,
	paymentProviderConfig,
} from "../schema/marketplace";
import { bootstrapTestDatabase, type TestDatabase } from "../test";

const ORG_ID = "wave2-org-1";
const LISTING_TYPE_ID = "wave2-listing-type-1";
const LISTING_ID = "wave2-listing-1";
const PAYMENT_PROVIDER_CONFIG_ID = "wave2-provider-config-1";

const dbState = bootstrapTestDatabase({
	seedStrategy: "beforeEach",
	seed: async (db: TestDatabase) => {
		await db.insert(organization).values({
			id: ORG_ID,
			name: "Wave 2 Org",
			slug: "wave-2-org",
		});

		await db.insert(listingTypeConfig).values({
			id: LISTING_TYPE_ID,
			slug: "wave2-listing-type",
			label: "Wave 2 Listing Type",
			metadataJsonSchema: {},
			isActive: true,
			sortOrder: 0,
		});

		await db.insert(listing).values({
			id: LISTING_ID,
			organizationId: ORG_ID,
			listingTypeSlug: "wave2-listing-type",
			name: "Wave 2 Listing",
			slug: "wave-2-listing",
			status: "active",
			isActive: true,
			timezone: "UTC",
		});

		await db.insert(paymentProviderConfig).values({
			id: PAYMENT_PROVIDER_CONFIG_ID,
			provider: "cloudpayments",
			displayName: "CloudPayments",
			supportedCurrencies: ["RUB"],
		});
	},
});

const getDb = () => dbState.db;

describe("Wave 2 schema hardening", () => {
	it("enforces one onboarding row per organization", async () => {
		const db = getDb();

		await db.insert(organizationOnboarding).values({
			id: "onboarding-1",
			organizationId: ORG_ID,
			lastRecalculatedAt: new Date("2026-03-10T10:00:00.000Z"),
		});

		await expect(
			db.insert(organizationOnboarding).values({
				id: "onboarding-2",
				organizationId: ORG_ID,
				lastRecalculatedAt: new Date("2026-03-10T11:00:00.000Z"),
			}),
		).rejects.toThrow();
	});

	it("stores availability exception dates as calendar strings", async () => {
		const db = getDb();

		const [row] = await db
			.insert(listingAvailabilityException)
			.values({
				id: "availability-exception-1",
				listingId: LISTING_ID,
				date: "2026-04-01",
				isAvailable: false,
			})
			.returning();

		expect(row?.date).toBe("2026-04-01");
	});

	it("rejects invalid availability rule minute ranges", async () => {
		await expect(
			getDb().insert(listingAvailabilityRule).values({
				id: "availability-rule-invalid",
				listingId: LISTING_ID,
				dayOfWeek: 7,
				startMinute: 600,
				endMinute: 540,
			}),
		).rejects.toThrow();
	});

	it("rejects invalid availability blocks with inverted windows", async () => {
		await expect(
			getDb()
				.insert(listingAvailabilityBlock)
				.values({
					id: "availability-block-invalid",
					listingId: LISTING_ID,
					startsAt: new Date("2026-05-01T12:00:00.000Z"),
					endsAt: new Date("2026-05-01T10:00:00.000Z"),
				}),
		).rejects.toThrow();
	});

	it("allows only one active default pricing profile per listing", async () => {
		const db = getDb();

		await db.insert(listingPricingProfile).values({
			id: "pricing-profile-1",
			listingId: LISTING_ID,
			name: "Default",
			currency: "RUB",
			baseHourlyPriceCents: 10_000,
			isDefault: true,
		});

		await expect(
			db.insert(listingPricingProfile).values({
				id: "pricing-profile-2",
				listingId: LISTING_ID,
				name: "Another default",
				currency: "RUB",
				baseHourlyPriceCents: 12_000,
				isDefault: true,
			}),
		).rejects.toThrow();
	});

	it("allows only one active primary calendar connection per listing", async () => {
		const db = getDb();

		await db.insert(listingCalendarConnection).values({
			id: "calendar-connection-1",
			listingId: LISTING_ID,
			organizationId: ORG_ID,
			provider: "google",
			externalCalendarId: "cal-1",
			isPrimary: true,
			isActive: true,
		});

		await expect(
			db.insert(listingCalendarConnection).values({
				id: "calendar-connection-2",
				listingId: LISTING_ID,
				organizationId: ORG_ID,
				provider: "manual",
				externalCalendarId: "cal-2",
				isPrimary: true,
				isActive: true,
			}),
		).rejects.toThrow();
	});

	it("allows only one primary listing image per listing", async () => {
		const db = getDb();

		await db.insert(listingAsset).values({
			id: "asset-1",
			listingId: LISTING_ID,
			kind: "image",
			storageKey: "image-1.jpg",
			isPrimary: true,
		});

		await expect(
			db.insert(listingAsset).values({
				id: "asset-2",
				listingId: LISTING_ID,
				kind: "image",
				storageKey: "image-2.jpg",
				isPrimary: true,
			}),
		).rejects.toThrow();
	});

	it("allows only one default listing type per organization", async () => {
		const db = getDb();

		await db.insert(organizationListingType).values({
			id: "organization-listing-type-1",
			organizationId: ORG_ID,
			listingTypeSlug: "wave2-listing-type",
			isDefault: true,
		});

		await expect(
			db.insert(organizationListingType).values({
				id: "organization-listing-type-2",
				organizationId: ORG_ID,
				listingTypeSlug: "wave2-listing-type",
				isDefault: true,
			}),
		).rejects.toThrow();
	});

	it("updates updated_at through database triggers on mutable tables", async () => {
		const db = getDb();

		const [inserted] = await db
			.insert(organizationPaymentConfig)
			.values({
				id: "org-payment-config-1",
				organizationId: ORG_ID,
				providerConfigId: PAYMENT_PROVIDER_CONFIG_ID,
				provider: "cloudpayments",
				encryptedCredentials: "enc",
				webhookEndpointId: "endpoint-1",
				isActive: false,
				validationStatus: "pending",
			})
			.returning({
				id: organizationPaymentConfig.id,
				updatedAt: organizationPaymentConfig.updatedAt,
			});
		expect(inserted).toBeDefined();
		if (!inserted) {
			throw new Error("Expected inserted organization payment config row");
		}

		await new Promise((resolve) => setTimeout(resolve, 5));

		const [updated] = await db
			.update(organizationPaymentConfig)
			.set({
				isActive: true,
				validationStatus: "validated",
			})
			.where(eq(organizationPaymentConfig.id, "org-payment-config-1"))
			.returning({
				id: organizationPaymentConfig.id,
				updatedAt: organizationPaymentConfig.updatedAt,
			});

		expect(updated?.updatedAt.getTime()).toBeGreaterThan(
			inserted.updatedAt.getTime(),
		);
	});
});
