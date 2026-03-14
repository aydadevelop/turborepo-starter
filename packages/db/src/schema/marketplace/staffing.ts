import {
	boolean,
	index,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { member, organization, user } from "../auth";
import { timestamps } from "../columns";
import { booking } from "./bookings";
import { listing } from "./listings";
import { staffAssignmentRoleEnum } from "./shared";

export const listingStaffAssignment = pgTable(
	"listing_staff_assignment",
	{
		id: text("id").primaryKey(),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		memberId: text("member_id")
			.notNull()
			.references(() => member.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: staffAssignmentRoleEnum("role").notNull().default("primary"),
		isActive: boolean("is_active").notNull().default(true),
		...timestamps,
	},
	(table) => [
		index("listing_staff_assignment_ix_listing_id").on(table.listingId),
		index("listing_staff_assignment_ix_member_id").on(table.memberId),
		index("listing_staff_assignment_ix_organization_id").on(
			table.organizationId,
		),
		uniqueIndex("listing_staff_assignment_uq_listing_member").on(
			table.listingId,
			table.memberId,
		),
	],
);

export const bookingStaffAssignment = pgTable(
	"booking_staff_assignment",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		memberId: text("member_id")
			.notNull()
			.references(() => member.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		role: staffAssignmentRoleEnum("role").notNull().default("primary"),
		assignedByUserId: text("assigned_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(table) => [
		index("booking_staff_assignment_ix_booking_id").on(table.bookingId),
		index("booking_staff_assignment_ix_member_id").on(table.memberId),
		index("booking_staff_assignment_ix_organization_id").on(
			table.organizationId,
		),
		uniqueIndex("booking_staff_assignment_uq_booking_member").on(
			table.bookingId,
			table.memberId,
		),
	],
);
