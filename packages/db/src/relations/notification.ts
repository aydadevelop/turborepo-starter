import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

export const notificationRelations = defineRelationsPart(schema, (r) => ({
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
}));
