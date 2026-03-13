import { assertSlotAvailable } from "./availability";
import { applyDiscountToQuote, calculateQuote } from "@my-app/pricing";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { booking, listing, listingPublication } from "@my-app/db/schema/marketplace";
import {
	recordPromotionUsage,
	resolvePromotionUsageForBooking,
} from "@my-app/promotions";
import {
	assertNoAvailabilityBlockOverlap,
	assertNoOverlap,
} from "./overlap";
import type {
	BookingCollectionResult,
	BookingRow,
	CreateBookingInput,
	Db,
	ListOrgBookingsInput,
	UpdateBookingScheduleInput,
	UpdateBookingStatusInput,
} from "./types";

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
	input: ListOrgBookingsInput,
	db: Db,
): Promise<BookingCollectionResult> {
	const filters = input.filter ?? {};
	const page = input.page ?? { limit: 50, offset: 0 };
	const conditions = [eq(booking.organizationId, organizationId)];
	if (filters.listingId) conditions.push(eq(booking.listingId, filters.listingId));
	if (filters.status) conditions.push(eq(booking.status, filters.status));
	if (filters.paymentStatus) {
		conditions.push(eq(booking.paymentStatus, filters.paymentStatus));
	}
	if (filters.source) {
		conditions.push(eq(booking.source, filters.source));
	}
	if (input.search) {
		conditions.push(
			or(
				ilike(booking.contactName, `%${input.search}%`),
				ilike(booking.contactEmail, `%${input.search}%`),
				ilike(booking.externalRef, `%${input.search}%`),
			)!,
		);
	}

	const orderBy =
		input.sort?.by === "starts_at"
			? input.sort.dir === "asc"
				? asc(booking.startsAt)
				: desc(booking.startsAt)
			: input.sort?.by === "ends_at"
				? input.sort.dir === "asc"
					? asc(booking.endsAt)
					: desc(booking.endsAt)
				: input.sort?.by === "status"
					? input.sort.dir === "asc"
						? asc(booking.status)
						: desc(booking.status)
					: input.sort?.dir === "asc"
						? asc(booking.createdAt)
						: desc(booking.createdAt);

	const [items, countResult] = await Promise.all([
		db
			.select()
			.from(booking)
			.where(and(...conditions))
			.orderBy(orderBy)
			.limit(page.limit)
			.offset(page.offset),
		db.select({ total: count() }).from(booking).where(and(...conditions)),
	]);

	return {
		items,
		total: countResult[0]?.total ?? 0,
	};
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
	return db.transaction(async (tx) => {
		const transactionDb = tx as unknown as Db;
		const bookingContext = await resolveBookingContext(
			input.listingId,
			transactionDb,
		);
		await assertSlotAvailable(
			input.listingId,
			input.startsAt,
			input.endsAt,
			transactionDb,
		);
		const quote = await calculateQuote(
			{
				listingId: input.listingId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				passengers: input.passengers,
			},
			transactionDb,
		);
		const promotionClaim = input.discountCode
			? await resolvePromotionUsageForBooking(
					{
						organizationId: bookingContext.organizationId,
						listingId: input.listingId,
						discountCode: input.discountCode,
						customerUserId: input.customerUserId,
						subtotalCents: quote.subtotalCents,
					},
					transactionDb,
				)
			: null;
		const discountedQuote = promotionClaim
			? applyDiscountToQuote(
					quote,
					promotionClaim.application.appliedAmountCents,
				)
			: null;
		const [row] = await tx
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
				basePriceCents: quote.subtotalCents,
				discountAmountCents:
					promotionClaim?.application.appliedAmountCents ?? 0,
				totalPriceCents:
					discountedQuote?.discountedTotalCents ?? quote.totalCents,
				platformCommissionCents: 0,
				currency: input.currency ?? quote.currency ?? "RUB",
			})
			.returning();

		if (!row) {
			throw new Error("BOOKING_CREATE_FAILED");
		}

		if (promotionClaim) {
			await recordPromotionUsage(
				{
					bookingId: row.id,
					customerUserId: input.customerUserId,
					promotion: promotionClaim,
				},
				transactionDb,
			);
		}

		return row;
	});
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

export async function updateBookingSchedule(
	input: UpdateBookingScheduleInput,
	db: Db,
): Promise<BookingRow> {
	const [current] = await db
		.select()
		.from(booking)
		.where(and(eq(booking.id, input.id), eq(booking.organizationId, input.organizationId)))
		.limit(1);
	if (!current) throw new Error("NOT_FOUND");

	if (!["pending", "awaiting_payment", "confirmed"].includes(current.status)) {
		throw new Error("INVALID_STATE");
	}

	await assertNoOverlap(
		{
			organizationId: input.organizationId,
			listingId: current.listingId,
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			excludeBookingId: current.id,
		},
		db,
	);
	await assertNoAvailabilityBlockOverlap(
		{
			listingId: current.listingId,
			startsAt: input.startsAt,
			endsAt: input.endsAt,
		},
		db,
	);

	const [updated] = await db
		.update(booking)
		.set({
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			timezone: input.timezone ?? current.timezone,
			updatedAt: new Date(),
		})
		.where(and(eq(booking.id, input.id), eq(booking.organizationId, input.organizationId)))
		.returning();

	if (input.workflowContext) {
		await input.workflowContext.eventBus.emit({
			type: "booking:schedule-updated",
			organizationId: updated!.organizationId,
			actorUserId: input.workflowContext.actorUserId,
			idempotencyKey: `booking:schedule-updated:${updated!.id}:${updated!.updatedAt.toISOString()}`,
			data: {
				bookingId: updated!.id,
				startsAt: updated!.startsAt.toISOString(),
				endsAt: updated!.endsAt.toISOString(),
				timezone: updated!.timezone ?? null,
			},
		});
	}

	return updated!;
}
