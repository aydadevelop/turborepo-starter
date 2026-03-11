import { defineRelationsPart } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: defineRelationsPart requires namespace import
import * as schema from "../schema";

export const authRelations = defineRelationsPart(schema, (r) => ({
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
		assistantChats: r.many.assistantChat({
			from: r.user.id,
			to: r.assistantChat.userId,
		}),
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
		closedTickets: r.many.supportTicket({
			from: r.user.id,
			to: r.supportTicket.closedByUserId,
			alias: "ticket_closer",
		}),
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
		notificationEvents: r.many.notificationEvent({
			from: r.organization.id,
			to: r.notificationEvent.organizationId,
		}),
		notificationIntents: r.many.notificationIntent({
			from: r.organization.id,
			to: r.notificationIntent.organizationId,
		}),
		notificationDeliveries: r.many.notificationDelivery({
			from: r.organization.id,
			to: r.notificationDelivery.organizationId,
		}),
		notificationPreferences: r.many.notificationPreference({
			from: r.organization.id,
			to: r.notificationPreference.organizationId,
		}),
		inAppNotifications: r.many.notificationInApp({
			from: r.organization.id,
			to: r.notificationInApp.organizationId,
		}),
		settings: r.many.organizationSettings({
			from: r.organization.id,
			to: r.organizationSettings.organizationId,
		}),
		listingTypes: r.many.organizationListingType({
			from: r.organization.id,
			to: r.organizationListingType.organizationId,
		}),
		listingLocations: r.many.listingLocation({
			from: r.organization.id,
			to: r.listingLocation.organizationId,
		}),
		listings: r.many.listing({
			from: r.organization.id,
			to: r.listing.organizationId,
		}),
		paymentConfigs: r.many.organizationPaymentConfig({
			from: r.organization.id,
			to: r.organizationPaymentConfig.organizationId,
		}),
		paymentWebhookEvents: r.many.paymentWebhookEvent({
			from: r.organization.id,
			to: r.paymentWebhookEvent.organizationId,
		}),
		listingPublications: r.many.listingPublication({
			from: r.organization.id,
			to: r.listingPublication.organizationId,
		}),
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
		bookingDiscountCodes: r.many.bookingDiscountCode({
			from: r.organization.id,
			to: r.bookingDiscountCode.organizationId,
		}),
		bookingPaymentAttempts: r.many.bookingPaymentAttempt({
			from: r.organization.id,
			to: r.bookingPaymentAttempt.organizationId,
		}),
		bookingShiftRequests: r.many.bookingShiftRequest({
			from: r.organization.id,
			to: r.bookingShiftRequest.organizationId,
		}),
		bookingCancellationRequests: r.many.bookingCancellationRequest({
			from: r.organization.id,
			to: r.bookingCancellationRequest.organizationId,
		}),
		bookingDisputes: r.many.bookingDispute({
			from: r.organization.id,
			to: r.bookingDispute.organizationId,
		}),
		bookingRefunds: r.many.bookingRefund({
			from: r.organization.id,
			to: r.bookingRefund.organizationId,
		}),
		listingReviews: r.many.listingReview({
			from: r.organization.id,
			to: r.listingReview.organizationId,
		}),
		calendarConnections: r.many.listingCalendarConnection({
			from: r.organization.id,
			to: r.listingCalendarConnection.organizationId,
		}),
		supportTickets: r.many.supportTicket({
			from: r.organization.id,
			to: r.supportTicket.organizationId,
		}),
		supportInboundMessages: r.many.inboundMessage({
			from: r.organization.id,
			to: r.inboundMessage.organizationId,
		}),
		supportTicketMessages: r.many.supportTicketMessage({
			from: r.organization.id,
			to: r.supportTicketMessage.organizationId,
		}),
		affiliateReferrals: r.many.affiliateReferral({
			from: r.organization.id,
			to: r.affiliateReferral.affiliateOrganizationId,
			alias: "affiliate_referrals_org",
		}),
		listingStaffAssignments: r.many.listingStaffAssignment({
			from: r.organization.id,
			to: r.listingStaffAssignment.organizationId,
		}),
		bookingStaffAssignments: r.many.bookingStaffAssignment({
			from: r.organization.id,
			to: r.bookingStaffAssignment.organizationId,
		}),
		cancellationPolicies: r.many.cancellationPolicy({
			from: r.organization.id,
			to: r.cancellationPolicy.organizationId,
		}),
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
		listingStaffAssignments: r.many.listingStaffAssignment({
			from: r.member.id,
			to: r.listingStaffAssignment.memberId,
		}),
		bookingStaffAssignments: r.many.bookingStaffAssignment({
			from: r.member.id,
			to: r.bookingStaffAssignment.memberId,
		}),
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
}));
