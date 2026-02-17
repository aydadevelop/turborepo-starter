import { db } from "@full-stack-cf-app/db";
import {
	booking,
	bookingCalendarLink,
	bookingDiscountApplication,
	bookingDiscountCode,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import type {
	CreateManagedBookingCalendarLinkInput,
	CreateManagedBookingInput,
	ResolvedBookingDiscount,
} from "../helpers";
import { syncCalendarLinkOnBookingCreate } from "./calendar-sync";

const getSqliteErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "";
};

export const createManagedBookingRecord = async (params: {
	input: CreateManagedBookingInput;
	organizationId: string;
	sessionUserId?: string;
	boatName: string;
	resolvedDiscount: ResolvedBookingDiscount | null;
	calendarLink: CreateManagedBookingCalendarLinkInput;
	totalPriceCentsOverride?: number;
}) => {
	const bookingId = crypto.randomUUID();
	const discountAmountCents = params.resolvedDiscount?.discountAmountCents ?? 0;
	const fallbackTotalPriceCents = Math.max(
		params.input.basePriceCents - discountAmountCents,
		0
	);
	const totalPriceCents =
		params.totalPriceCentsOverride !== undefined
			? Math.max(params.totalPriceCentsOverride, 0)
			: fallbackTotalPriceCents;
	try {
		await db.insert(booking).values({
			id: bookingId,
			organizationId: params.organizationId,
			boatId: params.input.boatId,
			customerUserId: params.input.customerUserId,
			createdByUserId: params.sessionUserId,
			source: params.input.source,
			status: params.input.status,
			paymentStatus: params.input.paymentStatus,
			calendarSyncStatus: "pending",
			startsAt: params.input.startsAt,
			endsAt: params.input.endsAt,
			passengers: params.input.passengers,
			contactName: params.input.contactName,
			contactPhone: params.input.contactPhone,
			contactEmail: params.input.contactEmail,
			timezone: params.input.timezone,
			basePriceCents: params.input.basePriceCents,
			discountAmountCents,
			totalPriceCents,
			currency: params.input.currency.toUpperCase(),
			notes: params.input.notes,
			specialRequests: params.input.specialRequests,
			externalRef: params.input.externalRef,
			metadata: params.input.metadata,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch (error) {
		const message = getSqliteErrorMessage(error);
		if (message.includes("BOOKING_OVERLAP")) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Boat is already booked for the selected time range",
			});
		}
		if (message.includes("BOOKING_INVALID_RANGE")) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Booking start must be before end",
			});
		}
		throw error;
	}

	try {
		await db.insert(bookingCalendarLink).values({
			id: crypto.randomUUID(),
			bookingId,
			boatCalendarConnectionId: params.calendarLink.boatCalendarConnectionId,
			provider: params.calendarLink.provider,
			externalCalendarId: params.calendarLink.externalCalendarId,
			externalEventId: params.calendarLink.externalEventId,
			iCalUid: params.calendarLink.iCalUid,
			externalEventVersion: params.calendarLink.externalEventVersion,
			syncedAt: params.calendarLink.syncedAt,
			syncError: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch {
		await db.delete(booking).where(eq(booking.id, bookingId));
		throw new ORPCError("BAD_REQUEST", {
			message: "Failed to attach calendar link for booking",
		});
	}

	const calendarSyncResult = await syncCalendarLinkOnBookingCreate({
		bookingId,
		organizationId: params.organizationId,
		boatId: params.input.boatId,
		boatName: params.boatName,
		source: params.input.source,
		startsAt: params.input.startsAt,
		endsAt: params.input.endsAt,
		timezone: params.input.timezone,
		contactName: params.input.contactName,
		notes: params.input.notes,
		calendarLink: params.calendarLink,
	});

	await db
		.update(booking)
		.set({
			calendarSyncStatus: calendarSyncResult.status,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, bookingId));

	await db
		.update(bookingCalendarLink)
		.set({
			...calendarSyncResult.calendarLinkUpdate,
			updatedAt: new Date(),
		})
		.where(eq(bookingCalendarLink.bookingId, bookingId));

	let createdDiscountApplication:
		| typeof bookingDiscountApplication.$inferSelect
		| null = null;
	if (params.resolvedDiscount) {
		const discountApplicationId = crypto.randomUUID();
		await db.insert(bookingDiscountApplication).values({
			id: discountApplicationId,
			bookingId,
			discountCodeId: params.resolvedDiscount.discountCodeId,
			code: params.resolvedDiscount.normalizedDiscountCode,
			discountType: params.resolvedDiscount.discountType,
			discountValue: params.resolvedDiscount.discountValue,
			appliedAmountCents: params.resolvedDiscount.discountAmountCents,
			appliedAt: new Date(),
		});

		await db
			.update(bookingDiscountCode)
			.set({
				usageCount: sql`${bookingDiscountCode.usageCount} + 1`,
				updatedAt: new Date(),
			})
			.where(
				eq(bookingDiscountCode.id, params.resolvedDiscount.discountCodeId)
			);

		const [selectedDiscountApplication] = await db
			.select()
			.from(bookingDiscountApplication)
			.where(eq(bookingDiscountApplication.id, discountApplicationId))
			.limit(1);

		createdDiscountApplication = selectedDiscountApplication ?? null;
	}

	const [createdBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, bookingId))
		.limit(1);

	if (!createdBooking) {
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}

	const [createdCalendarLink] = await db
		.select()
		.from(bookingCalendarLink)
		.where(eq(bookingCalendarLink.bookingId, bookingId))
		.limit(1);

	return {
		booking: createdBooking,
		calendarLink: createdCalendarLink,
		discountApplication: createdDiscountApplication,
	};
};
