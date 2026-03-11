import { defineRelationsPart } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: defineRelationsPart requires namespace import
import * as schema from "../schema";

export const availabilityRelations = defineRelationsPart(schema, (r) => ({
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
}));
