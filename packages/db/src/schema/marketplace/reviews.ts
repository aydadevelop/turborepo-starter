import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "../auth";
import { timestamps } from "../columns";
import { booking } from "./bookings";
import { listing } from "./listings";
import { reviewStatusEnum } from "./shared";

export const listingReview = pgTable(
	"listing_review",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		listingId: text("listing_id")
			.notNull()
			.references(() => listing.id, { onDelete: "cascade" }),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		reviewerUserId: text("reviewer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		rating: integer("rating").notNull(),
		title: text("title"),
		body: text("body"),
		status: reviewStatusEnum("status").notNull().default("pending"),
		publishedAt: timestamp("published_at", {
			withTimezone: true,
			mode: "date",
		}),
		moderatedByUserId: text("moderated_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		moderatedAt: timestamp("moderated_at", {
			withTimezone: true,
			mode: "date",
		}),
		moderationNote: text("moderation_note"),
		...timestamps,
	},
	(table) => [
		index("listing_review_ix_listing_id_status").on(
			table.listingId,
			table.status
		),
		index("listing_review_ix_organization_id").on(table.organizationId),
		index("listing_review_ix_reviewer_user_id").on(table.reviewerUserId),
		uniqueIndex("listing_review_uq_booking_id").on(table.bookingId),
	]
);

export const listingReviewResponse = pgTable(
	"listing_review_response",
	{
		id: text("id").primaryKey(),
		reviewId: text("review_id")
			.notNull()
			.references(() => listingReview.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		body: text("body").notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("listing_review_response_uq_review_id").on(table.reviewId),
	]
);
