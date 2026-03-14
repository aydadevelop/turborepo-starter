const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_MARKETPLACE_ANCHOR_DATE = new Date(
	"2026-03-15T00:00:00.000Z",
);

export const MARKETPLACE_IDS = {
	operatorOrgId: "seed_org_starter",
	customerOrgId: "seed_org_admin",
	operatorUserId: "seed_user_operator",
	customerUserId: "seed_user_member",
	listingTypeSlug: "seed_listing_type_vessel",
	listingId: "seed_listing_vessel_1",
	pricingProfileId: "seed_pricing_vessel_1",
	publicationId: "seed_publication_vessel_1_own_site",
	paymentProviderConfigId: "seed_payment_provider_config_stripe",
	orgPaymentConfigId: "seed_org_payment_config_stripe",
	bookingId: "seed_booking_confirmed_1",
	cancellationPolicyId: "seed_cancellation_policy_standard",
} as const;

export interface MarketplaceFixtureClock {
	anchorDate: Date;
	bookingEndsAt: Date;
	bookingStartsAt: Date;
	now: Date;
}

const isoOffset = (anchorDate: Date, offsetMs: number): Date =>
	new Date(anchorDate.getTime() + offsetMs);

export const createMarketplaceFixtureClock = (
	anchorDate: Date = DEFAULT_MARKETPLACE_ANCHOR_DATE,
): MarketplaceFixtureClock => ({
	anchorDate,
	now: isoOffset(anchorDate, 9 * HOUR_MS),
	bookingStartsAt: isoOffset(anchorDate, 2 * DAY_MS + 10 * HOUR_MS),
	bookingEndsAt: isoOffset(anchorDate, 2 * DAY_MS + 14 * HOUR_MS),
});
