import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

export const availabilityRelations = defineRelationsPart(schema, (r) => ({
	organizationCalendarAccount: {
		organization: r.one.organization({
			from: r.organizationCalendarAccount.organizationId,
			to: r.organization.id,
		}),
		createdByUser: r.one.user({
			from: r.organizationCalendarAccount.createdByUserId,
			to: r.user.id,
			alias: "calendar_account_creator",
		}),
		listingConnections: r.many.listingCalendarConnection({
			from: r.organizationCalendarAccount.id,
			to: r.listingCalendarConnection.calendarAccountId,
		}),
		sources: r.many.organizationCalendarSource({
			from: r.organizationCalendarAccount.id,
			to: r.organizationCalendarSource.calendarAccountId,
		}),
	},

	organizationCalendarSource: {
		organization: r.one.organization({
			from: r.organizationCalendarSource.organizationId,
			to: r.organization.id,
		}),
		calendarAccount: r.one.organizationCalendarAccount({
			from: r.organizationCalendarSource.calendarAccountId,
			to: r.organizationCalendarAccount.id,
		}),
		listingConnections: r.many.listingCalendarConnection({
			from: r.organizationCalendarSource.id,
			to: r.listingCalendarConnection.calendarSourceId,
		}),
	},

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
		calendarAccount: r.one.organizationCalendarAccount({
			from: r.listingCalendarConnection.calendarAccountId,
			to: r.organizationCalendarAccount.id,
		}),
		calendarSource: r.one.organizationCalendarSource({
			from: r.listingCalendarConnection.calendarSourceId,
			to: r.organizationCalendarSource.id,
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
