import { defineRelations } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: defineRelations requires namespace import
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	// Auth
	user: {
		sessions: r.many.session(),
		accounts: r.many.account(),
		passkeys: r.many.passkey(),
		memberships: r.many.member(),
		sentInvitations: r.many.invitation({
			from: r.user.id,
			to: r.invitation.inviterId,
		}),
		consents: r.many.userConsent({
			from: r.user.id,
			to: r.userConsent.userId,
		}),
		actedNotificationEvents: r.many.notificationEvent({
			from: r.user.id,
			to: r.notificationEvent.actorUserId,
		}),
		notificationIntents: r.many.notificationIntent({
			from: r.user.id,
			to: r.notificationIntent.recipientUserId,
			alias: "notification_recipient",
		}),
		notificationPreferences: r.many.notificationPreference({
			from: r.user.id,
			to: r.notificationPreference.userId,
		}),
		createdNotificationPreferences: r.many.notificationPreference({
			from: r.user.id,
			to: r.notificationPreference.createdByUserId,
			alias: "notification_pref_creator",
		}),
		inAppNotifications: r.many.notificationInApp({
			from: r.user.id,
			to: r.notificationInApp.userId,
		}),
		assistantChats: r.many.assistantChat(),
		// Marketplace — customer perspective
		customerBookings: r.many.booking({
			from: r.user.id,
			to: r.booking.customerUserId,
			alias: "booking_customer",
		}),
		createdBookings: r.many.booking({
			from: r.user.id,
			to: r.booking.createdByUserId,
			alias: "booking_creator",
		}),
		writtenReviews: r.many.listingReview({
			from: r.user.id,
			to: r.listingReview.reviewerUserId,
			alias: "review_reviewer",
		}),
		// Affiliate
		affiliateReferrals: r.many.affiliateReferral({
			from: r.user.id,
			to: r.affiliateReferral.affiliateUserId,
		}),
		affiliateAttributions: r.many.bookingAffiliateAttribution({
			from: r.user.id,
			to: r.bookingAffiliateAttribution.affiliateUserId,
			alias: "affiliate_attributions",
		}),
		affiliatePayouts: r.many.bookingAffiliatePayout({
			from: r.user.id,
			to: r.bookingAffiliatePayout.affiliateUserId,
			alias: "affiliate_payouts",
		}),
		// Support
		customerTickets: r.many.supportTicket({
			from: r.user.id,
			to: r.supportTicket.customerUserId,
			alias: "ticket_customer",
		}),
		assignedTickets: r.many.supportTicket({
			from: r.user.id,
			to: r.supportTicket.assignedToUserId,
			alias: "ticket_assignee",
		}),
		createdTickets: r.many.supportTicket({
			from: r.user.id,
			to: r.supportTicket.createdByUserId,
			alias: "ticket_creator",
		}),
		resolvedTickets: r.many.supportTicket({
			from: r.user.id,
			to: r.supportTicket.resolvedByUserId,
			alias: "ticket_resolver",
		}),
		// Support messages authored
		supportMessages: r.many.supportTicketMessage({
			from: r.user.id,
			to: r.supportTicketMessage.authorUserId,
			alias: "ticket_message_author",
		}),
	},

	session: {
		user: r.one.user({
			from: r.session.userId,
			to: r.user.id,
		}),
	},

	account: {
		user: r.one.user({
			from: r.account.userId,
			to: r.user.id,
		}),
	},

	passkey: {
		user: r.one.user({
			from: r.passkey.userId,
			to: r.user.id,
		}),
	},

	organization: {
		members: r.many.member(),
		invitations: r.many.invitation(),
		notificationEvents: r.many.notificationEvent(),
		notificationIntents: r.many.notificationIntent(),
		notificationDeliveries: r.many.notificationDelivery(),
		notificationPreferences: r.many.notificationPreference(),
		inAppNotifications: r.many.notificationInApp(),
		// Marketplace
		settings: r.many.organizationSettings(),
		listingTypes: r.many.organizationListingType(),
		listingLocations: r.many.listingLocation(),
		listings: r.many.listing(),
		paymentConfigs: r.many.organizationPaymentConfig(),
		paymentWebhookEvents: r.many.paymentWebhookEvent(),
		listingPublications: r.many.listingPublication(),
		bookings: r.many.booking({
			from: r.organization.id,
			to: r.booking.organizationId,
			alias: "booking_org",
		}),
		merchantBookings: r.many.booking({
			from: r.organization.id,
			to: r.booking.merchantOrganizationId,
			alias: "booking_merchant_org",
		}),
		bookingDiscountCodes: r.many.bookingDiscountCode(),
		bookingPaymentAttempts: r.many.bookingPaymentAttempt(),
		bookingShiftRequests: r.many.bookingShiftRequest(),
		bookingDisputes: r.many.bookingDispute(),
		bookingRefunds: r.many.bookingRefund(),
		listingReviews: r.many.listingReview(),
		// Availability
		calendarConnections: r.many.listingCalendarConnection(),
		// Support
		supportTickets: r.many.supportTicket(),
		supportInboundMessages: r.many.inboundMessage(),
		// Support messages
		supportTicketMessages: r.many.supportTicketMessage(),
		// Affiliate
		affiliateReferrals: r.many.affiliateReferral({
			from: r.organization.id,
			to: r.affiliateReferral.affiliateOrganizationId,
			alias: "affiliate_referrals_org",
		}),
		// Staff & policies
		listingStaffAssignments: r.many.listingStaffAssignment(),
		bookingStaffAssignments: r.many.bookingStaffAssignment(),
		cancellationPolicies: r.many.cancellationPolicy(),
	},

	member: {
		organization: r.one.organization({
			from: r.member.organizationId,
			to: r.organization.id,
		}),
		user: r.one.user({
			from: r.member.userId,
			to: r.user.id,
		}),
		listingStaffAssignments: r.many.listingStaffAssignment(),
		bookingStaffAssignments: r.many.bookingStaffAssignment(),
	},

	invitation: {
		organization: r.one.organization({
			from: r.invitation.organizationId,
			to: r.organization.id,
		}),
		inviter: r.one.user({
			from: r.invitation.inviterId,
			to: r.user.id,
		}),
	},

	// Notifications
	notificationEvent: {
		organization: r.one.organization({
			from: r.notificationEvent.organizationId,
			to: r.organization.id,
		}),
		actorUser: r.one.user({
			from: r.notificationEvent.actorUserId,
			to: r.user.id,
			alias: "notification_event_actor",
		}),
		intents: r.many.notificationIntent(),
		inAppNotifications: r.many.notificationInApp(),
	},

	notificationIntent: {
		event: r.one.notificationEvent({
			from: r.notificationIntent.eventId,
			to: r.notificationEvent.id,
		}),
		organization: r.one.organization({
			from: r.notificationIntent.organizationId,
			to: r.organization.id,
		}),
		recipientUser: r.one.user({
			from: r.notificationIntent.recipientUserId,
			to: r.user.id,
			alias: "notification_recipient",
		}),
		deliveries: r.many.notificationDelivery(),
		inAppNotifications: r.many.notificationInApp(),
	},

	notificationDelivery: {
		intent: r.one.notificationIntent({
			from: r.notificationDelivery.intentId,
			to: r.notificationIntent.id,
		}),
		organization: r.one.organization({
			from: r.notificationDelivery.organizationId,
			to: r.organization.id,
		}),
	},

	notificationPreference: {
		user: r.one.user({
			from: r.notificationPreference.userId,
			to: r.user.id,
		}),
		organization: r.one.organization({
			from: r.notificationPreference.organizationId,
			to: r.organization.id,
		}),
		createdByUser: r.one.user({
			from: r.notificationPreference.createdByUserId,
			to: r.user.id,
			alias: "notification_pref_creator",
		}),
	},

	notificationInApp: {
		event: r.one.notificationEvent({
			from: r.notificationInApp.eventId,
			to: r.notificationEvent.id,
		}),
		intent: r.one.notificationIntent({
			from: r.notificationInApp.intentId,
			to: r.notificationIntent.id,
		}),
		organization: r.one.organization({
			from: r.notificationInApp.organizationId,
			to: r.organization.id,
		}),
		user: r.one.user({
			from: r.notificationInApp.userId,
			to: r.user.id,
		}),
	},

	// Assistant
	assistantChat: {
		user: r.one.user({
			from: r.assistantChat.userId,
			to: r.user.id,
		}),
		messages: r.many.assistantMessage(),
	},

	assistantMessage: {
		chat: r.one.assistantChat({
			from: r.assistantMessage.chatId,
			to: r.assistantChat.id,
		}),
	},

	// Consent
	userConsent: {
		user: r.one.user({
			from: r.userConsent.userId,
			to: r.user.id,
		}),
	},

	// Marketplace
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
		// Availability
		availabilityRules: r.many.listingAvailabilityRule(),
		availabilityExceptions: r.many.listingAvailabilityException(),
		availabilityBlocks: r.many.listingAvailabilityBlock(),
		minimumDurationRules: r.many.listingMinimumDurationRule(),
		calendarConnections: r.many.listingCalendarConnection(),
		// Staff & policies
		staffAssignments: r.many.listingStaffAssignment(),
		cancellationPolicy: r.many.cancellationPolicy(),
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
		disputes: r.many.bookingDispute(),
		refunds: r.many.bookingRefund(),
		reviews: r.many.listingReview(),
		// Availability
		calendarLink: r.one.bookingCalendarLink({
			from: r.booking.id,
			to: r.bookingCalendarLink.bookingId,
		}),
		// Affiliate
		affiliateAttribution: r.many.bookingAffiliateAttribution(),
		affiliatePayout: r.many.bookingAffiliatePayout(),
		// Staff
		staffAssignments: r.many.bookingStaffAssignment(),
		// Support
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

	// Availability
	listingAvailabilityRule: {
		listing: r.one.listing({
			from: r.listingAvailabilityRule.listingId,
			to: r.listing.id,
		}),
	},

	listingAvailabilityException: {
		listing: r.one.listing({
			from: r.listingAvailabilityException.listingId,
			to: r.listing.id,
		}),
		createdByUser: r.one.user({
			from: r.listingAvailabilityException.createdByUserId,
			to: r.user.id,
			alias: "availability_exception_creator",
		}),
	},

	listingAvailabilityBlock: {
		listing: r.one.listing({
			from: r.listingAvailabilityBlock.listingId,
			to: r.listing.id,
		}),
		calendarConnection: r.one.listingCalendarConnection({
			from: r.listingAvailabilityBlock.calendarConnectionId,
			to: r.listingCalendarConnection.id,
		}),
		createdByUser: r.one.user({
			from: r.listingAvailabilityBlock.createdByUserId,
			to: r.user.id,
			alias: "availability_block_creator",
		}),
	},

	listingMinimumDurationRule: {
		listing: r.one.listing({
			from: r.listingMinimumDurationRule.listingId,
			to: r.listing.id,
		}),
	},

	listingCalendarConnection: {
		listing: r.one.listing({
			from: r.listingCalendarConnection.listingId,
			to: r.listing.id,
		}),
		organization: r.one.organization({
			from: r.listingCalendarConnection.organizationId,
			to: r.organization.id,
		}),
		createdByUser: r.one.user({
			from: r.listingCalendarConnection.createdByUserId,
			to: r.user.id,
			alias: "calendar_connection_creator",
		}),
		availabilityBlocks: r.many.listingAvailabilityBlock(),
		webhookEvents: r.many.calendarWebhookEvent(),
		bookingCalendarLinks: r.many.bookingCalendarLink(),
	},

	calendarWebhookEvent: {
		calendarConnection: r.one.listingCalendarConnection({
			from: r.calendarWebhookEvent.calendarConnectionId,
			to: r.listingCalendarConnection.id,
		}),
	},

	bookingCalendarLink: {
		booking: r.one.booking({
			from: r.bookingCalendarLink.bookingId,
			to: r.booking.id,
		}),
		calendarConnection: r.one.listingCalendarConnection({
			from: r.bookingCalendarLink.calendarConnectionId,
			to: r.listingCalendarConnection.id,
		}),
	},

	// Affiliate
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

	// Support
	supportTicket: {
		organization: r.one.organization({
			from: r.supportTicket.organizationId,
			to: r.organization.id,
		}),
		booking: r.one.booking({
			from: r.supportTicket.bookingId,
			to: r.booking.id,
		}),
		customerUser: r.one.user({
			from: r.supportTicket.customerUserId,
			to: r.user.id,
			alias: "ticket_customer",
		}),
		createdByUser: r.one.user({
			from: r.supportTicket.createdByUserId,
			to: r.user.id,
			alias: "ticket_creator",
		}),
		assignedToUser: r.one.user({
			from: r.supportTicket.assignedToUserId,
			to: r.user.id,
			alias: "ticket_assignee",
		}),
		resolvedByUser: r.one.user({
			from: r.supportTicket.resolvedByUserId,
			to: r.user.id,
			alias: "ticket_resolver",
		}),
		messages: r.many.supportTicketMessage(),
		inboundMessages: r.many.inboundMessage(),
	},

	supportTicketMessage: {
		ticket: r.one.supportTicket({
			from: r.supportTicketMessage.ticketId,
			to: r.supportTicket.id,
		}),
		organization: r.one.organization({
			from: r.supportTicketMessage.organizationId,
			to: r.organization.id,
		}),
		authorUser: r.one.user({
			from: r.supportTicketMessage.authorUserId,
			to: r.user.id,
			alias: "ticket_message_author",
		}),
		inboundMessage: r.one.inboundMessage({
			from: r.supportTicketMessage.inboundMessageId,
			to: r.inboundMessage.id,
		}),
	},

	inboundMessage: {
		organization: r.one.organization({
			from: r.inboundMessage.organizationId,
			to: r.organization.id,
		}),
		ticket: r.one.supportTicket({
			from: r.inboundMessage.ticketId,
			to: r.supportTicket.id,
		}),
		ticketMessages: r.many.supportTicketMessage(),
	},

	// Staff assignments
	listingStaffAssignment: {
		listing: r.one.listing({
			from: r.listingStaffAssignment.listingId,
			to: r.listing.id,
		}),
		member: r.one.member({
			from: r.listingStaffAssignment.memberId,
			to: r.member.id,
		}),
		organization: r.one.organization({
			from: r.listingStaffAssignment.organizationId,
			to: r.organization.id,
		}),
	},

	bookingStaffAssignment: {
		booking: r.one.booking({
			from: r.bookingStaffAssignment.bookingId,
			to: r.booking.id,
		}),
		member: r.one.member({
			from: r.bookingStaffAssignment.memberId,
			to: r.member.id,
		}),
		organization: r.one.organization({
			from: r.bookingStaffAssignment.organizationId,
			to: r.organization.id,
		}),
		assignedByUser: r.one.user({
			from: r.bookingStaffAssignment.assignedByUserId,
			to: r.user.id,
			alias: "booking_staff_assigner",
		}),
	},

	// Cancellation policies
	cancellationPolicy: {
		organization: r.one.organization({
			from: r.cancellationPolicy.organizationId,
			to: r.organization.id,
		}),
		listing: r.one.listing({
			from: r.cancellationPolicy.listingId,
			to: r.listing.id,
		}),
	},
}));
