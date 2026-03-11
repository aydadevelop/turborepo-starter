import { assertSlotAvailable } from "./availability";
import { calculateQuote } from "@my-app/pricing";
import { and, desc, eq } from "drizzle-orm";
import { booking, listing, listingPublication } from "@my-app/db/schema/marketplace";
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

async function resolveBookingContext(listingId: string, db: Db) {
	const [row] = await db
		.select({
			listingOrganizationId: listing.organizationId,
			publicationId: listingPublication.id,
			publicationOrganizationId: listingPublication.organizationId,
			merchantPaymentConfigId: listingPublication.merchantPaymentConfigId,
		})
		.from(listing)
		.leftJoin(
			listingPublication,
			and(
				eq(listingPublication.listingId, listing.id),
				eq(listingPublication.isActive, true),
				eq(listingPublication.channelType, "platform_marketplace"),
			),
		)
		.where(and(eq(listing.id, listingId), eq(listing.isActive, true)))
		.limit(1);

	if (!row?.publicationId || !row.publicationOrganizationId) {
		throw new Error("NOT_FOUND");
	}

	if (row.listingOrganizationId !== row.publicationOrganizationId) {
		throw new Error("PUBLICATION_ORG_MISMATCH");
	}

	return {
		organizationId: row.listingOrganizationId,
		publicationId: row.publicationId,
		merchantOrganizationId: row.publicationOrganizationId,
		merchantPaymentConfigId: row.merchantPaymentConfigId,
	};
}

export async function createBooking(input: CreateBookingInput, db: Db): Promise<BookingRow> {
	const bookingContext = await resolveBookingContext(input.listingId, db);
	await assertSlotAvailable(input.listingId, input.startsAt, input.endsAt, db);
	const quote = await calculateQuote(
		{ listingId: input.listingId, startsAt: input.startsAt, endsAt: input.endsAt, passengers: input.passengers },
		db,
	);
	const [row] = await db
		.insert(booking)
		.values({
			id: crypto.randomUUID(),
			organizationId: bookingContext.organizationId,
			listingId: input.listingId,
			publicationId: bookingContext.publicationId,
			merchantOrganizationId: bookingContext.merchantOrganizationId,
			merchantPaymentConfigId: bookingContext.merchantPaymentConfigId,
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

	if (input.workflowContext && (input.status === "confirmed" || input.status === "cancelled")) {
		if (input.status === "confirmed") {
			await input.workflowContext.eventBus.emit({
				type: "booking:confirmed",
				organizationId: updated!.organizationId,
				actorUserId: input.workflowContext.actorUserId,
				idempotencyKey: `booking:confirmed:${updated!.id}`,
				data: {
					bookingId: updated!.id,
					ownerId: updated!.organizationId,
				},
			});
		} else {
			await input.workflowContext.eventBus.emit({
				type: "booking:cancelled",
				organizationId: updated!.organizationId,
				actorUserId: input.workflowContext.actorUserId,
				idempotencyKey: `booking:cancelled:${updated!.id}`,
				data: {
					bookingId: updated!.id,
					reason: updated!.cancellationReason ?? input.cancellationReason ?? "cancelled",
					refundAmountKopeks: input.refundAmountCents ?? 0,
				},
			});
		}
	}

	return updated!;
}
