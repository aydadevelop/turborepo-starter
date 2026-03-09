/**
 * Marketplace scenario fixture builder for the DB test harness.
 *
 * Builds a representative, self-consistent marketplace state:
 *   operator org → listing type config → listing → pricing profile
 *   listing → publication (own_site)
 *   customer user → booking (web, confirmed, paid)
 *
 * Uses deterministic `seed_` prefixed IDs derived from an anchor-date offset
 * so scenarios are reproducible across test runs and local development.
 *
 * Shared data shape: The IDs and values here deliberately mirror those in
 * `packages/db/scripts/seed-local.mjs` (marketplace section) so that test
 * fixture state and CLI seed state tell the same baseline story.
 */

import { type TestDatabase } from "../index";
import {
	booking,
	cancellationPolicy,
	listing,
	listingPricingProfile,
	listingPublication,
	listingTypeConfig,
	organizationPaymentConfig,
	organizationSettings,
	paymentProviderConfig,
} from "../../schema/marketplace";
import { organization, user } from "../../schema/auth";

// ---------------------------------------------------------------------------
// IDs — deterministic, seed-namespace prefixed, mirrors seed-local.mjs
// ---------------------------------------------------------------------------

export const MARKETPLACE_IDS = {
	// Orgs
	operatorOrgId: "seed_org_starter", // matches existing seed org
	customerOrgId: "seed_org_admin", // matches existing seed org

	// Users
	operatorUserId: "seed_user_operator",
	customerUserId: "seed_user_member",

	// Listing type
	listingTypeSlug: "seed_listing_type_vessel",

	// Listing
	listingId: "seed_listing_vessel_1",
	pricingProfileId: "seed_pricing_vessel_1",
	publicationId: "seed_publication_vessel_1_own_site",
	paymentProviderConfigId: "seed_payment_provider_config_stripe",
	orgPaymentConfigId: "seed_org_payment_config_stripe",

	// Booking
	bookingId: "seed_booking_confirmed_1",

	// Cancellation policy
	cancellationPolicyId: "seed_cancellation_policy_standard",
} as const;

// ---------------------------------------------------------------------------
// Data builders
// ---------------------------------------------------------------------------

function anchorMs(anchorDate: Date): number {
	return anchorDate.getTime();
}

function isoOffset(anchorDate: Date, offsetMs: number): Date {
	return new Date(anchorMs(anchorDate) + offsetMs);
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Fixture seeder
// ---------------------------------------------------------------------------

export interface MarketplaceFixtureSeedOptions {
	anchorDate?: Date;
}

/**
 * Seed a self-consistent marketplace scenario into the given test database.
 * Call inside a `bootstrapTestDatabase` seed function or directly in a beforeAll.
 *
 * Requires `user` and `organization` rows with the IDs from MARKETPLACE_IDS
 * to already exist (they are created by the auth seed fixtures in
 * bootstrapTestDatabase by default).
 *
 * Returns the ID map so tests can reference created entities.
 */
export const seedMarketplaceScenario = async (
	db: TestDatabase,
	options: MarketplaceFixtureSeedOptions = {}
): Promise<typeof MARKETPLACE_IDS> => {
	const anchorDate = options.anchorDate ?? new Date("2026-03-15T00:00:00.000Z");
	const now = isoOffset(anchorDate, 9 * HOUR_MS);

	// 1. Required auth rows (created by the auth fixtures that are seeded by
	//    the default test database seed strategy in bootstrapTestDatabase).
	//    We insert minimal versions here so the scenario is self-contained.
	await db
		.insert(organization)
		.values([
			{
				id: MARKETPLACE_IDS.operatorOrgId,
				name: "Starter Organization",
				slug: "starter-org",
				createdAt: now,
			},
		])
		.onConflictDoNothing();

	await db
		.insert(user)
		.values([
			{
				id: MARKETPLACE_IDS.operatorUserId,
				name: "Operations User",
				email: "operator@example.com",
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			},
			{
				id: MARKETPLACE_IDS.customerUserId,
				name: "Member User",
				email: "member@example.com",
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			},
		])
		.onConflictDoNothing();

	// 2. Listing type config (platform-level, not org-scoped)
	await db
		.insert(listingTypeConfig)
		.values({
			id: MARKETPLACE_IDS.listingTypeSlug,
			slug: MARKETPLACE_IDS.listingTypeSlug,
			label: "Vessel",
			metadataJsonSchema: { type: "object", properties: {} },
			isActive: true,
			sortOrder: 1,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 3. Organization settings
	await db
		.insert(organizationSettings)
		.values({
			id: `${MARKETPLACE_IDS.operatorOrgId}_settings`,
			organizationId: MARKETPLACE_IDS.operatorOrgId,
			timezone: "UTC",
			defaultCurrency: "RUB",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 4. Listing
	await db
		.insert(listing)
		.values({
			id: MARKETPLACE_IDS.listingId,
			organizationId: MARKETPLACE_IDS.operatorOrgId,
			listingTypeSlug: MARKETPLACE_IDS.listingTypeSlug,
			name: "Vessel One",
			slug: "vessel-one",
			description: "A standard test vessel listing.",
			minimumDurationMinutes: 120,
			minimumNoticeMinutes: 60,
			timezone: "UTC",
			status: "active",
			isActive: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 5. Pricing profile
	await db
		.insert(listingPricingProfile)
		.values({
			id: MARKETPLACE_IDS.pricingProfileId,
			listingId: MARKETPLACE_IDS.listingId,
			name: "Standard Hourly",
			currency: "RUB",
			baseHourlyPriceCents: 300_000, // 3000 RUB/hr
			minimumHours: 2,
			depositBps: 3000, // 30%
			isDefault: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 6. Payment provider config (platform-level)
	await db
		.insert(paymentProviderConfig)
		.values({
			id: MARKETPLACE_IDS.paymentProviderConfigId,
			provider: "stripe",
			displayName: "Stripe (test)",
			isActive: true,
			supportedCurrencies: ["RUB", "USD"],
			sandboxAvailable: true,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 7. Organization payment config
	await db
		.insert(organizationPaymentConfig)
		.values({
			id: MARKETPLACE_IDS.orgPaymentConfigId,
			organizationId: MARKETPLACE_IDS.operatorOrgId,
			providerConfigId: MARKETPLACE_IDS.paymentProviderConfigId,
			provider: "stripe",
			isActive: true,
			encryptedCredentials: "seed-placeholder-not-real",
			webhookEndpointId: `seed_webhook_endpoint_${MARKETPLACE_IDS.operatorOrgId}`,
			validationStatus: "validated",
			validatedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 8. Listing publication (own_site)
	await db
		.insert(listingPublication)
		.values({
			id: MARKETPLACE_IDS.publicationId,
			listingId: MARKETPLACE_IDS.listingId,
			organizationId: MARKETPLACE_IDS.operatorOrgId,
			channelType: "own_site",
			isActive: true,
			visibility: "public",
			merchantType: "platform",
			merchantPaymentConfigId: MARKETPLACE_IDS.orgPaymentConfigId,
			pricingProfileId: MARKETPLACE_IDS.pricingProfileId,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 9. Cancellation policy
	await db
		.insert(cancellationPolicy)
		.values({
			id: MARKETPLACE_IDS.cancellationPolicyId,
			organizationId: MARKETPLACE_IDS.operatorOrgId,
			listingId: MARKETPLACE_IDS.listingId,
			scope: "listing",
			name: "Standard",
			freeWindowHours: 48,
			penaltyBps: 5000,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	// 10. Booking (web, confirmed, paid)
	await db
		.insert(booking)
		.values({
			id: MARKETPLACE_IDS.bookingId,
			organizationId: MARKETPLACE_IDS.operatorOrgId,
			listingId: MARKETPLACE_IDS.listingId,
			publicationId: MARKETPLACE_IDS.publicationId,
			merchantOrganizationId: MARKETPLACE_IDS.operatorOrgId,
			merchantPaymentConfigId: MARKETPLACE_IDS.orgPaymentConfigId,
			customerUserId: MARKETPLACE_IDS.customerUserId,
			source: "web",
			status: "confirmed",
			paymentStatus: "paid",
			calendarSyncStatus: "not_applicable",
			startsAt: isoOffset(anchorDate, 2 * DAY_MS + 10 * HOUR_MS),
			endsAt: isoOffset(anchorDate, 2 * DAY_MS + 14 * HOUR_MS),
			basePriceCents: 1_200_000, // 12,000 RUB (4h × 3000)
			discountAmountCents: 0,
			totalPriceCents: 1_200_000,
			platformCommissionCents: 0,
			currency: "RUB",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	return MARKETPLACE_IDS;
};
