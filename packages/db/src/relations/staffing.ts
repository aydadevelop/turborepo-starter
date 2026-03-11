import { defineRelationsPart } from "drizzle-orm";
// biome-ignore lint/performance/noNamespaceImport: defineRelationsPart requires namespace import
import * as schema from "../schema";

export const staffingRelations = defineRelationsPart(schema, (r) => ({
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
