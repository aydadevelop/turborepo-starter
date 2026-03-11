import type { TestDatabase } from "../../index";
import {
	createBookingFixture,
	createCancellationPolicyFixture,
	createListingFixture,
	createListingPricingProfileFixture,
	createListingPublicationFixture,
	createListingTypeConfigFixture,
	createOrganizationFixture,
	createOrganizationPaymentConfigFixture,
	createOrganizationSettingsFixture,
	createPaymentProviderConfigFixture,
	createUserFixture,
} from "../factories";
import {
	createMarketplaceFixtureClock,
	DEFAULT_MARKETPLACE_ANCHOR_DATE,
	MARKETPLACE_IDS,
} from "../shared";

export interface MarketplaceBaselineScenarioOptions {
	anchorDate?: Date;
}

export const seedMarketplaceBaselineScenario = async (
	db: TestDatabase,
	options: MarketplaceBaselineScenarioOptions = {}
) => {
	const clock = createMarketplaceFixtureClock(
		options.anchorDate ?? DEFAULT_MARKETPLACE_ANCHOR_DATE
	);

	const operatorOrganization = await createOrganizationFixture(db, {
		id: MARKETPLACE_IDS.operatorOrgId,
		name: "Starter Organization",
		slug: "starter-org",
		createdAt: clock.now,
	});

	const operatorUser = await createUserFixture(db, {
		id: MARKETPLACE_IDS.operatorUserId,
		name: "Operations User",
		email: "operator@example.com",
		emailVerified: true,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const customerUser = await createUserFixture(db, {
		id: MARKETPLACE_IDS.customerUserId,
		name: "Member User",
		email: "member@example.com",
		emailVerified: true,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const listingType = await createListingTypeConfigFixture(db, {
		id: MARKETPLACE_IDS.listingTypeSlug,
		slug: MARKETPLACE_IDS.listingTypeSlug,
		label: "Vessel",
		metadataJsonSchema: { type: "object", properties: {} },
		isActive: true,
		sortOrder: 1,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const settings = await createOrganizationSettingsFixture(db, {
		id: `${MARKETPLACE_IDS.operatorOrgId}_settings`,
		organizationId: MARKETPLACE_IDS.operatorOrgId,
		timezone: "UTC",
		defaultCurrency: "RUB",
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const seededListing = await createListingFixture(db, {
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
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const pricingProfile = await createListingPricingProfileFixture(db, {
		id: MARKETPLACE_IDS.pricingProfileId,
		listingId: MARKETPLACE_IDS.listingId,
		name: "Standard Hourly",
		currency: "RUB",
		baseHourlyPriceCents: 300_000,
		minimumHours: 2,
		depositBps: 3000,
		isDefault: true,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const paymentProvider = await createPaymentProviderConfigFixture(db, {
		id: MARKETPLACE_IDS.paymentProviderConfigId,
		provider: "stripe",
		displayName: "Stripe (test)",
		isActive: true,
		supportedCurrencies: ["RUB", "USD"],
		sandboxAvailable: true,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const organizationPayment = await createOrganizationPaymentConfigFixture(db, {
		id: MARKETPLACE_IDS.orgPaymentConfigId,
		organizationId: MARKETPLACE_IDS.operatorOrgId,
		providerConfigId: MARKETPLACE_IDS.paymentProviderConfigId,
		provider: "stripe",
		isActive: true,
		encryptedCredentials: "seed-placeholder-not-real",
		webhookEndpointId: `seed_webhook_endpoint_${MARKETPLACE_IDS.operatorOrgId}`,
		validationStatus: "validated",
		validatedAt: clock.now,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const publication = await createListingPublicationFixture(db, {
		id: MARKETPLACE_IDS.publicationId,
		listingId: MARKETPLACE_IDS.listingId,
		organizationId: MARKETPLACE_IDS.operatorOrgId,
		channelType: "own_site",
		isActive: true,
		visibility: "public",
		merchantType: "platform",
		merchantPaymentConfigId: MARKETPLACE_IDS.orgPaymentConfigId,
		pricingProfileId: MARKETPLACE_IDS.pricingProfileId,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const policy = await createCancellationPolicyFixture(db, {
		id: MARKETPLACE_IDS.cancellationPolicyId,
		organizationId: MARKETPLACE_IDS.operatorOrgId,
		listingId: MARKETPLACE_IDS.listingId,
		scope: "listing",
		name: "Standard",
		freeWindowHours: 48,
		penaltyBps: 5000,
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	const seededBooking = await createBookingFixture(db, {
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
		startsAt: clock.bookingStartsAt,
		endsAt: clock.bookingEndsAt,
		basePriceCents: 1_200_000,
		discountAmountCents: 0,
		totalPriceCents: 1_200_000,
		platformCommissionCents: 0,
		currency: "RUB",
		createdAt: clock.now,
		updatedAt: clock.now,
	});

	return {
		ids: MARKETPLACE_IDS,
		clock,
		operatorOrganization,
		operatorUser,
		customerUser,
		listingType,
		settings,
		listing: seededListing,
		pricingProfile,
		paymentProvider,
		organizationPayment,
		publication,
		cancellationPolicy: policy,
		booking: seededBooking,
	};
};
