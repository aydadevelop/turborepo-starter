import { and, desc, eq } from "drizzle-orm";
import { booking } from "@my-app/db/schema/marketplace";
import type { BookingRow, Db, ListOrgBookingsFilter } from "./types";

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
