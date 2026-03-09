import { assertSlotAvailable } from "@my-app/availability";
import { calculateQuote } from "@my-app/pricing";
import { and, desc, eq } from "drizzle-orm";
import { booking } from "@my-app/db/schema/marketplace";
import type { BookingRow, CreateBookingInput, Db, ListOrgBookingsFilter, UpdateBookingStatusInput } from "./types";

const VALID_TRANSITIONS: Record<string, string[]> = {
	pending: ["awaiting_payment", "confirmed", "rejected", "cancelled"],
	awaiting_payment: ["confirmed", "cancelled"],
	confirmed: ["in_progress", "cancelled"],
	in_progress: ["completed", "cancelled"],
	completed: [],
	cancelled: [],
	rejected: [],
	no_show: [],
	disputed: [],
};

export async function listOrgBookings(
	organizationId: string,
	filters: ListOrgBookingsFilter,
	db: Db,
): Promise<BookingRow[]> {
	const conditions = [eq(booking.organizationId, organizationId)];
	if (filters.listingId) conditions.push(eq(booking.listingId, filters.listingId));
	if (filters.status) conditions.push(eq(booking.status, filters.status));
	return db
		.select()
		.from(booking)
		.where(and(...conditions))
		.orderBy(desc(booking.createdAt))
		.limit(filters.limit ?? 50)
		.offset(filters.offset ?? 0);
}

export async function getOrgBooking(id: string, organizationId: string, db: Db): Promise<BookingRow> {
	const [row] = await db
		.select()
		.from(booking)
		.where(and(eq(booking.id, id), eq(booking.organizationId, organizationId)))
		.limit(1);
	if (!row) throw new Error("NOT_FOUND");
	return row;
}

export async function listCustomerBookings(customerUserId: string, db: Db): Promise<BookingRow[]> {
	return db
		.select()
		.from(booking)
		.where(eq(booking.customerUserId, customerUserId))
		.orderBy(desc(booking.createdAt))
		.limit(100);
}

export async function createBooking(input: CreateBookingInput, db: Db): Promise<BookingRow> {
	await assertSlotAvailable(input.listingId, input.startsAt, input.endsAt, db);
	const quote = await calculateQuote(
		{ listingId: input.listingId, startsAt: input.startsAt, endsAt: input.endsAt, passengers: input.passengers },
		db,
	);
	const [row] = await db
		.insert(booking)
		.values({
			id: crypto.randomUUID(),
			organizationId: input.organizationId,
			listingId: input.listingId,
			publicationId: input.publicationId,
			merchantOrganizationId: input.organizationId,
			customerUserId: input.customerUserId,
			createdByUserId: input.createdByUserId,
			source: input.source,
			status: "pending",
			paymentStatus: "unpaid",
			calendarSyncStatus: "pending",
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			passengers: input.passengers,
			contactName: input.contactName,
			contactPhone: input.contactPhone,
			contactEmail: input.contactEmail,
			timezone: input.timezone,
			notes: input.notes,
			specialRequests: input.specialRequests,
			basePriceCents: quote.baseCents + quote.adjustmentCents,
			discountAmountCents: 0,
			totalPriceCents: quote.totalCents,
			platformCommissionCents: 0,
			currency: input.currency ?? "RUB",
		})
		.returning();
	return row!;
}

export async function updateBookingStatus(input: UpdateBookingStatusInput, db: Db): Promise<BookingRow> {
	const [current] = await db
		.select()
		.from(booking)
		.where(and(eq(booking.id, input.id), eq(booking.organizationId, input.organizationId)))
		.limit(1);
	if (!current) throw new Error("NOT_FOUND");

	const allowed = VALID_TRANSITIONS[current.status] ?? [];
	if (!allowed.includes(input.status)) throw new Error("INVALID_TRANSITION");

	const payload: Partial<typeof booking.$inferInsert> & { updatedAt: Date } = {
		status: input.status,
		updatedAt: new Date(),
	};
	if (input.status === "cancelled") {
		payload.cancelledAt = new Date();
		payload.cancelledByUserId = input.cancelledByUserId;
		payload.cancellationReason = input.cancellationReason;
	}

	const [updated] = await db
		.update(booking)
		.set(payload)
		.where(and(eq(booking.id, input.id), eq(booking.organizationId, input.organizationId)))
		.returning();
	return updated!;
}
