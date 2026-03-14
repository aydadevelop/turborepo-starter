import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

export const affiliateRelations = defineRelationsPart(schema, (r) => ({
	affiliateReferral: {
		affiliateUser: r.one.user({
			from: r.affiliateReferral.affiliateUserId,
			to: r.user.id,
		}),
		affiliateOrganization: r.one.organization({
			from: r.affiliateReferral.affiliateOrganizationId,
			to: r.organization.id,
			alias: "affiliate_referrals_org",
		}),
		attributions: r.many.bookingAffiliateAttribution(),
	},

	bookingAffiliateAttribution: {
		booking: r.one.booking({
			from: r.bookingAffiliateAttribution.bookingId,
			to: r.booking.id,
		}),
		affiliateUser: r.one.user({
			from: r.bookingAffiliateAttribution.affiliateUserId,
			to: r.user.id,
			alias: "affiliate_attributions",
		}),
		referral: r.one.affiliateReferral({
			from: r.bookingAffiliateAttribution.referralId,
			to: r.affiliateReferral.id,
		}),
		payout: r.many.bookingAffiliatePayout(),
	},

	bookingAffiliatePayout: {
		attribution: r.one.bookingAffiliateAttribution({
			from: r.bookingAffiliatePayout.attributionId,
			to: r.bookingAffiliateAttribution.id,
		}),
		booking: r.one.booking({
			from: r.bookingAffiliatePayout.bookingId,
			to: r.booking.id,
		}),
		affiliateUser: r.one.user({
			from: r.bookingAffiliatePayout.affiliateUserId,
			to: r.user.id,
			alias: "affiliate_payouts",
		}),
	},
}));
