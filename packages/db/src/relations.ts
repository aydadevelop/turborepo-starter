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
}));
