import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

export const marketplaceRelations = defineRelationsPart(schema, (r) => ({
	organizationSettings: {
		organization: r.one.organization({
			from: r.organizationSettings.organizationId,
			to: r.organization.id,
		}),
	},

	listingTypeConfig: {
		organizationListingTypes: r.many.organizationListingType(),
		listings: r.many.listing(),
	},

	organizationListingType: {
		organization: r.one.organization({
			from: r.organizationListingType.organizationId,
			to: r.organization.id,
		}),
		listingTypeConfig: r.one.listingTypeConfig({
			from: r.organizationListingType.listingTypeSlug,
			to: r.listingTypeConfig.slug,
		}),
	},

	listingLocation: {
		organization: r.one.organization({
			from: r.listingLocation.organizationId,
			to: r.organization.id,
		}),
		listings: r.many.listing(),
	},

	listing: {
		organization: r.one.organization({
			from: r.listing.organizationId,
			to: r.organization.id,
		}),
		listingType: r.one.listingTypeConfig({
			from: r.listing.listingTypeSlug,
			to: r.listingTypeConfig.slug,
		}),
		location: r.one.listingLocation({
			from: r.listing.locationId,
			to: r.listingLocation.id,
		}),
		amenities: r.many.listingAmenity(),
		assets: r.many.listingAsset(),
		pricingProfiles: r.many.listingPricingProfile(),
		pricingRules: r.many.listingPricingRule(),
		publications: r.many.listingPublication(),
		bookings: r.many.booking(),
		discountCodes: r.many.bookingDiscountCode({
			from: r.listing.id,
			to: r.bookingDiscountCode.appliesToListingId,
		}),
		reviews: r.many.listingReview(),
		moderationAuditEntries: r.many.listingModerationAudit(),
		boatRentProfile: r.one.listingBoatRentProfile({
			from: r.listing.id,
			to: r.listingBoatRentProfile.listingId,
		}),
		excursionProfile: r.one.listingExcursionProfile({
			from: r.listing.id,
			to: r.listingExcursionProfile.listingId,
		}),
		availabilityRules: r.many.listingAvailabilityRule({
			from: r.listing.id,
			to: r.listingAvailabilityRule.listingId,
		}),
		availabilityExceptions: r.many.listingAvailabilityException({
			from: r.listing.id,
			to: r.listingAvailabilityException.listingId,
		}),
		availabilityBlocks: r.many.listingAvailabilityBlock({
			from: r.listing.id,
			to: r.listingAvailabilityBlock.listingId,
		}),
		minimumDurationRules: r.many.listingMinimumDurationRule({
			from: r.listing.id,
			to: r.listingMinimumDurationRule.listingId,
		}),
		calendarConnections: r.many.listingCalendarConnection({
			from: r.listing.id,
			to: r.listingCalendarConnection.listingId,
		}),
		staffAssignments: r.many.listingStaffAssignment({
			from: r.listing.id,
			to: r.listingStaffAssignment.listingId,
		}),
		cancellationPolicy: r.many.cancellationPolicy({
			from: r.listing.id,
			to: r.cancellationPolicy.listingId,
		}),
	},

	listingAmenity: {
		listing: r.one.listing({
			from: r.listingAmenity.listingId,
			to: r.listing.id,
		}),
	},

	listingAsset: {
		listing: r.one.listing({
			from: r.listingAsset.listingId,
			to: r.listing.id,
		}),
	},

	listingModerationAudit: {
		organization: r.one.organization({
			from: r.listingModerationAudit.organizationId,
			to: r.organization.id,
		}),
		listing: r.one.listing({
			from: r.listingModerationAudit.listingId,
			to: r.listing.id,
		}),
		actedByUser: r.one.user({
			from: r.listingModerationAudit.actedByUserId,
			to: r.user.id,
			alias: "listing_moderation_actor",
		}),
	},

	listingBoatRentProfile: {
		listing: r.one.listing({
			from: r.listingBoatRentProfile.listingId,
			to: r.listing.id,
		}),
		organization: r.one.organization({
			from: r.listingBoatRentProfile.organizationId,
			to: r.organization.id,
		}),
	},

	listingExcursionProfile: {
		listing: r.one.listing({
			from: r.listingExcursionProfile.listingId,
			to: r.listing.id,
		}),
		organization: r.one.organization({
			from: r.listingExcursionProfile.organizationId,
			to: r.organization.id,
		}),
	},

	listingPricingProfile: {
		listing: r.one.listing({
			from: r.listingPricingProfile.listingId,
			to: r.listing.id,
		}),
		createdByUser: r.one.user({
			from: r.listingPricingProfile.createdByUserId,
			to: r.user.id,
			alias: "pricing_profile_creator",
		}),
		rules: r.many.listingPricingRule(),
		publications: r.many.listingPublication({
			from: r.listingPricingProfile.id,
			to: r.listingPublication.pricingProfileId,
		}),
	},

	listingPricingRule: {
		listing: r.one.listing({
			from: r.listingPricingRule.listingId,
			to: r.listing.id,
		}),
		pricingProfile: r.one.listingPricingProfile({
			from: r.listingPricingRule.pricingProfileId,
			to: r.listingPricingProfile.id,
		}),
	},

	platformFeeConfig: {
		createdByUser: r.one.user({
			from: r.platformFeeConfig.createdByUserId,
			to: r.user.id,
			alias: "platform_fee_creator",
		}),
	},

	paymentProviderConfig: {
		organizationPaymentConfigs: r.many.organizationPaymentConfig(),
	},

	organizationPaymentConfig: {
		organization: r.one.organization({
			from: r.organizationPaymentConfig.organizationId,
			to: r.organization.id,
		}),
		providerConfig: r.one.paymentProviderConfig({
			from: r.organizationPaymentConfig.providerConfigId,
			to: r.paymentProviderConfig.id,
		}),
		publications: r.many.listingPublication({
			from: r.organizationPaymentConfig.id,
			to: r.listingPublication.merchantPaymentConfigId,
		}),
		bookings: r.many.booking({
			from: r.organizationPaymentConfig.id,
			to: r.booking.merchantPaymentConfigId,
		}),
	},

	paymentWebhookEvent: {
		organization: r.one.organization({
			from: r.paymentWebhookEvent.organizationId,
			to: r.organization.id,
		}),
	},

	listingPublication: {
		listing: r.one.listing({
			from: r.listingPublication.listingId,
			to: r.listing.id,
		}),
		organization: r.one.organization({
			from: r.listingPublication.organizationId,
			to: r.organization.id,
		}),
		merchantPaymentConfig: r.one.organizationPaymentConfig({
			from: r.listingPublication.merchantPaymentConfigId,
			to: r.organizationPaymentConfig.id,
		}),
		pricingProfile: r.one.listingPricingProfile({
			from: r.listingPublication.pricingProfileId,
			to: r.listingPricingProfile.id,
		}),
		bookings: r.many.booking(),
	},

	booking: {
		organization: r.one.organization({
			from: r.booking.organizationId,
			to: r.organization.id,
			alias: "booking_org",
		}),
		listing: r.one.listing({
			from: r.booking.listingId,
			to: r.listing.id,
		}),
		publication: r.one.listingPublication({
			from: r.booking.publicationId,
			to: r.listingPublication.id,
		}),
		merchantOrganization: r.one.organization({
			from: r.booking.merchantOrganizationId,
			to: r.organization.id,
			alias: "booking_merchant_org",
		}),
		merchantPaymentConfig: r.one.organizationPaymentConfig({
			from: r.booking.merchantPaymentConfigId,
			to: r.organizationPaymentConfig.id,
		}),
		customerUser: r.one.user({
			from: r.booking.customerUserId,
			to: r.user.id,
			alias: "booking_customer",
		}),
		createdByUser: r.one.user({
			from: r.booking.createdByUserId,
			to: r.user.id,
			alias: "booking_creator",
		}),
		cancelledByUser: r.one.user({
			from: r.booking.cancelledByUserId,
			to: r.user.id,
			alias: "booking_canceller",
		}),
		discountApplications: r.many.bookingDiscountApplication(),
		paymentAttempts: r.many.bookingPaymentAttempt(),
		shiftRequests: r.many.bookingShiftRequest(),
		cancellationRequest: r.one.bookingCancellationRequest({
			from: r.booking.id,
			to: r.bookingCancellationRequest.bookingId,
		}),
		disputes: r.many.bookingDispute(),
		refunds: r.many.bookingRefund(),
		reviews: r.many.listingReview(),
		calendarLink: r.one.bookingCalendarLink({
			from: r.booking.id,
			to: r.bookingCalendarLink.bookingId,
		}),
		affiliateAttribution: r.many.bookingAffiliateAttribution({
			from: r.booking.id,
			to: r.bookingAffiliateAttribution.bookingId,
		}),
		affiliatePayout: r.many.bookingAffiliatePayout({
			from: r.booking.id,
			to: r.bookingAffiliatePayout.bookingId,
		}),
		staffAssignments: r.many.bookingStaffAssignment({
			from: r.booking.id,
			to: r.bookingStaffAssignment.bookingId,
		}),
		supportTickets: r.many.supportTicket({
			from: r.booking.id,
			to: r.supportTicket.bookingId,
		}),
	},

	bookingDiscountCode: {
		organization: r.one.organization({
			from: r.bookingDiscountCode.organizationId,
			to: r.organization.id,
		}),
		appliesToListing: r.one.listing({
			from: r.bookingDiscountCode.appliesToListingId,
			to: r.listing.id,
		}),
		createdByUser: r.one.user({
			from: r.bookingDiscountCode.createdByUserId,
			to: r.user.id,
			alias: "discount_code_creator",
		}),
		applications: r.many.bookingDiscountApplication(),
	},

	bookingDiscountApplication: {
		booking: r.one.booking({
			from: r.bookingDiscountApplication.bookingId,
			to: r.booking.id,
		}),
		discountCode: r.one.bookingDiscountCode({
			from: r.bookingDiscountApplication.discountCodeId,
			to: r.bookingDiscountCode.id,
		}),
		customerUser: r.one.user({
			from: r.bookingDiscountApplication.customerUserId,
			to: r.user.id,
			alias: "discount_application_customer",
		}),
	},

	bookingPaymentAttempt: {
		booking: r.one.booking({
			from: r.bookingPaymentAttempt.bookingId,
			to: r.booking.id,
		}),
		organization: r.one.organization({
			from: r.bookingPaymentAttempt.organizationId,
			to: r.organization.id,
		}),
		requestedByUser: r.one.user({
			from: r.bookingPaymentAttempt.requestedByUserId,
			to: r.user.id,
			alias: "payment_attempt_requester",
		}),
	},

	bookingShiftRequest: {
		booking: r.one.booking({
			from: r.bookingShiftRequest.bookingId,
			to: r.booking.id,
		}),
		organization: r.one.organization({
			from: r.bookingShiftRequest.organizationId,
			to: r.organization.id,
		}),
		requestedByUser: r.one.user({
			from: r.bookingShiftRequest.requestedByUserId,
			to: r.user.id,
			alias: "shift_req_requester",
		}),
		customerDecisionByUser: r.one.user({
			from: r.bookingShiftRequest.customerDecisionByUserId,
			to: r.user.id,
			alias: "shift_req_customer_decision",
		}),
		managerDecisionByUser: r.one.user({
			from: r.bookingShiftRequest.managerDecisionByUserId,
			to: r.user.id,
			alias: "shift_req_manager_decision",
		}),
		rejectedByUser: r.one.user({
			from: r.bookingShiftRequest.rejectedByUserId,
			to: r.user.id,
			alias: "shift_req_rejecter",
		}),
		appliedByUser: r.one.user({
			from: r.bookingShiftRequest.appliedByUserId,
			to: r.user.id,
			alias: "shift_req_applier",
		}),
	},

	bookingDispute: {
		booking: r.one.booking({
			from: r.bookingDispute.bookingId,
			to: r.booking.id,
		}),
		organization: r.one.organization({
			from: r.bookingDispute.organizationId,
			to: r.organization.id,
		}),
		raisedByUser: r.one.user({
			from: r.bookingDispute.raisedByUserId,
			to: r.user.id,
			alias: "dispute_raiser",
		}),
		resolvedByUser: r.one.user({
			from: r.bookingDispute.resolvedByUserId,
			to: r.user.id,
			alias: "dispute_resolver",
		}),
	},

	bookingCancellationRequest: {
		booking: r.one.booking({
			from: r.bookingCancellationRequest.bookingId,
			to: r.booking.id,
		}),
		organization: r.one.organization({
			from: r.bookingCancellationRequest.organizationId,
			to: r.organization.id,
		}),
		requestedByUser: r.one.user({
			from: r.bookingCancellationRequest.requestedByUserId,
			to: r.user.id,
			alias: "cancel_req_requester",
		}),
		customerDecisionByUser: r.one.user({
			from: r.bookingCancellationRequest.customerDecisionByUserId,
			to: r.user.id,
			alias: "cancel_req_customer_decision",
		}),
		managerDecisionByUser: r.one.user({
			from: r.bookingCancellationRequest.managerDecisionByUserId,
			to: r.user.id,
			alias: "cancel_req_manager_decision",
		}),
		appliedByUser: r.one.user({
			from: r.bookingCancellationRequest.appliedByUserId,
			to: r.user.id,
			alias: "cancel_req_applier",
		}),
	},

	bookingRefund: {
		booking: r.one.booking({
			from: r.bookingRefund.bookingId,
			to: r.booking.id,
		}),
		organization: r.one.organization({
			from: r.bookingRefund.organizationId,
			to: r.organization.id,
		}),
		requestedByUser: r.one.user({
			from: r.bookingRefund.requestedByUserId,
			to: r.user.id,
			alias: "refund_requester",
		}),
		approvedByUser: r.one.user({
			from: r.bookingRefund.approvedByUserId,
			to: r.user.id,
			alias: "refund_approver",
		}),
		processedByUser: r.one.user({
			from: r.bookingRefund.processedByUserId,
			to: r.user.id,
			alias: "refund_processor",
		}),
	},

	listingReview: {
		organization: r.one.organization({
			from: r.listingReview.organizationId,
			to: r.organization.id,
		}),
		listing: r.one.listing({
			from: r.listingReview.listingId,
			to: r.listing.id,
		}),
		booking: r.one.booking({
			from: r.listingReview.bookingId,
			to: r.booking.id,
		}),
		reviewerUser: r.one.user({
			from: r.listingReview.reviewerUserId,
			to: r.user.id,
			alias: "review_reviewer",
		}),
		moderatedByUser: r.one.user({
			from: r.listingReview.moderatedByUserId,
			to: r.user.id,
			alias: "review_moderator",
		}),
		responses: r.many.listingReviewResponse(),
	},

	listingReviewResponse: {
		review: r.one.listingReview({
			from: r.listingReviewResponse.reviewId,
			to: r.listingReview.id,
		}),
		authorUser: r.one.user({
			from: r.listingReviewResponse.authorUserId,
			to: r.user.id,
			alias: "review_response_author",
		}),
	},
}));
