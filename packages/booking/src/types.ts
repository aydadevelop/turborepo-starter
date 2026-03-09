import type { db } from "@my-app/db";
import type { booking } from "@my-app/db/schema/marketplace";

export type Db = typeof db;
export type BookingRow = typeof booking.$inferSelect;

export interface CreateBookingInput {
	organizationId: string;
	listingId: string;
	publicationId: string;
	startsAt: Date;
	endsAt: Date;
	passengers?: number;
	contactName?: string;
	contactPhone?: string;
	contactEmail?: string;
	timezone?: string;
	notes?: string;
	specialRequests?: string;
	source: "manual" | "web" | "telegram" | "partner" | "api" | "calendar_sync";
	customerUserId?: string;
	createdByUserId?: string;
	currency?: string;
}

export interface UpdateBookingStatusInput {
	id: string;
	organizationId: string;
	status:
		| "pending"
		| "awaiting_payment"
		| "confirmed"
		| "in_progress"
		| "completed"
		| "cancelled"
		| "rejected"
		| "no_show"
		| "disputed";
	cancellationReason?: string;
	cancelledByUserId?: string;
}

export interface ListOrgBookingsFilter {
	listingId?: string;
	status?: BookingRow["status"];
	limit?: number;
	offset?: number;
}
