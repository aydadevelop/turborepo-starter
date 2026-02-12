import { defineRelations } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: defineRelations requires namespace import
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	// ── Auth ──────────────────────────────────────────────────────────
	user: {
		sessions: r.many.session(),
		accounts: r.many.account(),
		passkeys: r.many.passkey(),
		memberships: r.many.member(),
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
		sentInvitations: r.many.invitation({
			from: r.user.id,
			to: r.invitation.inviterId,
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

	// ── Boat ─────────────────────────────────────────────────────────
	boatDock: {
		organization: r.one.organization({
			from: r.boatDock.organizationId,
			to: r.organization.id,
		}),
		boats: r.many.boat(),
	},

	boat: {
		organization: r.one.organization({
			from: r.boat.organizationId,
			to: r.organization.id,
		}),
		dock: r.one.boatDock({
			from: r.boat.dockId,
			to: r.boatDock.id,
		}),
		amenities: r.many.boatAmenity(),
		assets: r.many.boatAsset(),
		calendarConnections: r.many.boatCalendarConnection(),
		availabilityRules: r.many.boatAvailabilityRule(),
		availabilityBlocks: r.many.boatAvailabilityBlock(),
		pricingProfiles: r.many.boatPricingProfile(),
		pricingRules: r.many.boatPricingRule(),
	},

	boatAmenity: {
		boat: r.one.boat({
			from: r.boatAmenity.boatId,
			to: r.boat.id,
		}),
	},

	boatAsset: {
		boat: r.one.boat({
			from: r.boatAsset.boatId,
			to: r.boat.id,
		}),
		uploadedByUser: r.one.user({
			from: r.boatAsset.uploadedByUserId,
			to: r.user.id,
		}),
	},

	boatCalendarConnection: {
		boat: r.one.boat({
			from: r.boatCalendarConnection.boatId,
			to: r.boat.id,
		}),
		availabilityBlocks: r.many.boatAvailabilityBlock(),
		webhookEvents: r.many.calendarWebhookEvent(),
	},

	calendarWebhookEvent: {
		calendarConnection: r.one.boatCalendarConnection({
			from: r.calendarWebhookEvent.calendarConnectionId,
			to: r.boatCalendarConnection.id,
		}),
	},

	boatAvailabilityRule: {
		boat: r.one.boat({
			from: r.boatAvailabilityRule.boatId,
			to: r.boat.id,
		}),
	},

	boatAvailabilityBlock: {
		boat: r.one.boat({
			from: r.boatAvailabilityBlock.boatId,
			to: r.boat.id,
		}),
		calendarConnection: r.one.boatCalendarConnection({
			from: r.boatAvailabilityBlock.calendarConnectionId,
			to: r.boatCalendarConnection.id,
		}),
		createdByUser: r.one.user({
			from: r.boatAvailabilityBlock.createdByUserId,
			to: r.user.id,
		}),
	},

	boatPricingProfile: {
		boat: r.one.boat({
			from: r.boatPricingProfile.boatId,
			to: r.boat.id,
		}),
		createdByUser: r.one.user({
			from: r.boatPricingProfile.createdByUserId,
			to: r.user.id,
		}),
		rules: r.many.boatPricingRule(),
	},

	boatPricingRule: {
		boat: r.one.boat({
			from: r.boatPricingRule.boatId,
			to: r.boat.id,
		}),
		pricingProfile: r.one.boatPricingProfile({
			from: r.boatPricingRule.pricingProfileId,
			to: r.boatPricingProfile.id,
		}),
	},

	// ── Booking ──────────────────────────────────────────────────────
	booking: {
		organization: r.one.organization({
			from: r.booking.organizationId,
			to: r.organization.id,
		}),
		boat: r.one.boat({
			from: r.booking.boatId,
			to: r.boat.id,
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
		calendarLink: r.one.bookingCalendarLink({
			from: r.booking.id,
			to: r.bookingCalendarLink.bookingId,
		}),
		discountApplications: r.many.bookingDiscountApplication(),
		paymentAttempts: r.many.bookingPaymentAttempt(),
		cancellationRequest: r.one.bookingCancellationRequest({
			from: r.booking.id,
			to: r.bookingCancellationRequest.bookingId,
		}),
		disputes: r.many.bookingDispute(),
		refunds: r.many.bookingRefund(),
	},

	bookingCalendarLink: {
		booking: r.one.booking({
			from: r.bookingCalendarLink.bookingId,
			to: r.booking.id,
		}),
		boatCalendarConnection: r.one.boatCalendarConnection({
			from: r.bookingCalendarLink.boatCalendarConnectionId,
			to: r.boatCalendarConnection.id,
		}),
	},

	bookingDiscountCode: {
		organization: r.one.organization({
			from: r.bookingDiscountCode.organizationId,
			to: r.organization.id,
		}),
		appliesToBoat: r.one.boat({
			from: r.bookingDiscountCode.appliesToBoatId,
			to: r.boat.id,
		}),
		createdByUser: r.one.user({
			from: r.bookingDiscountCode.createdByUserId,
			to: r.user.id,
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
			alias: "cancellation_requester",
		}),
		reviewedByUser: r.one.user({
			from: r.bookingCancellationRequest.reviewedByUserId,
			to: r.user.id,
			alias: "cancellation_reviewer",
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

	// ── Notifications ────────────────────────────────────────────────
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

	// ── Support ──────────────────────────────────────────────────────
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
		telegramNotifications: r.many.telegramNotification(),
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
		telegramWebhookEvents: r.many.telegramWebhookEvent(),
	},

	telegramNotification: {
		organization: r.one.organization({
			from: r.telegramNotification.organizationId,
			to: r.organization.id,
		}),
		ticket: r.one.supportTicket({
			from: r.telegramNotification.ticketId,
			to: r.supportTicket.id,
		}),
		requestedByUser: r.one.user({
			from: r.telegramNotification.requestedByUserId,
			to: r.user.id,
		}),
	},

	telegramWebhookEvent: {
		organization: r.one.organization({
			from: r.telegramWebhookEvent.organizationId,
			to: r.organization.id,
		}),
		inboundMessage: r.one.inboundMessage({
			from: r.telegramWebhookEvent.inboundMessageId,
			to: r.inboundMessage.id,
		}),
	},
}));
