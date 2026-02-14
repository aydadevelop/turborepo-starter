import { db } from "@full-stack-cf-app/db";
import {
	type BookingCalendarSyncStatus,
	booking,
	type bookingCalendarLink,
	bookingDiscountCode,
	bookingDispute,
	bookingPaymentAttempt,
	bookingRefund,
	type bookingStatusValues,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import type z from "zod";

import { requireManaged } from "../../lib/db-helpers";
import {
	requireCalendarConnectionForBoat,
	requireManagedBoat as requireManagedBoatImpl,
} from "../boat/access";
import type { createManagedBookingInputSchema } from "../booking.schemas";
import {
	requireActiveMembership as requireActiveMembershipImpl,
	requireSessionUserId as requireSessionUserIdImpl,
} from "../shared/auth-utils";

export const requireManagedBoat = requireManagedBoatImpl;
export const requireActiveMembership = requireActiveMembershipImpl;
export const requireSessionUserId = requireSessionUserIdImpl;

export const blockingBookingStatuses: (typeof bookingStatusValues)[number][] = [
	"pending",
	"awaiting_payment",
	"confirmed",
	"in_progress",
];

export type CreateManagedBookingInput = z.infer<
	typeof createManagedBookingInputSchema
>;
export type CreateManagedBookingCalendarLinkInput =
	CreateManagedBookingInput["calendarLink"];

export interface ResolvedBookingDiscount {
	discountCodeId: string;
	discountType: "percentage" | "fixed_cents";
	discountValue: number;
	discountAmountCents: number;
	normalizedDiscountCode: string;
}

export interface CalendarSyncResult {
	status: BookingCalendarSyncStatus;
	calendarLinkUpdate: Partial<typeof bookingCalendarLink.$inferInsert>;
}

export const requireManagedCalendarConnection = async (params: {
	boatId: string;
	calendarConnectionId: string;
}) =>
	requireCalendarConnectionForBoat(params.calendarConnectionId, params.boatId);

export const requireManagedBooking = (
	bookingId: string,
	organizationId: string
) => requireManaged(booking, bookingId, organizationId);

export const requireManagedDiscountCode = (
	discountCodeId: string,
	organizationId: string
) => requireManaged(bookingDiscountCode, discountCodeId, organizationId);

export const requireCustomerBookingAccess = async (params: {
	bookingId: string;
	userId: string;
}) => {
	const [customerBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, params.bookingId))
		.limit(1);

	if (!customerBooking) {
		throw new ORPCError("NOT_FOUND");
	}

	const hasAccess =
		customerBooking.customerUserId === params.userId ||
		customerBooking.createdByUserId === params.userId;
	if (!hasAccess) {
		throw new ORPCError("FORBIDDEN");
	}

	return customerBooking;
};

export const requireManagedDispute = (params: {
	disputeId: string;
	organizationId: string;
}) => requireManaged(bookingDispute, params.disputeId, params.organizationId);

export const requireManagedRefund = (params: {
	refundId: string;
	organizationId: string;
}) => requireManaged(bookingRefund, params.refundId, params.organizationId);

export const requireManagedPaymentAttempt = (params: {
	paymentAttemptId: string;
	organizationId: string;
}) =>
	requireManaged(
		bookingPaymentAttempt,
		params.paymentAttemptId,
		params.organizationId
	);

export const syncBookingPaymentStatusFromAttempts = async (
	managedBookingId: string
) => {
	const [managedBooking] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, managedBookingId))
		.limit(1);

	if (!managedBooking) {
		throw new ORPCError("NOT_FOUND");
	}

	const [capturedAmountRow] = await db
		.select({
			capturedAmountCents: sql<number>`coalesce(sum(case when ${bookingPaymentAttempt.status} = 'captured' then ${bookingPaymentAttempt.amountCents} else 0 end), 0)`,
		})
		.from(bookingPaymentAttempt)
		.where(eq(bookingPaymentAttempt.bookingId, managedBooking.id));

	const capturedAmountCents = Number(
		capturedAmountRow?.capturedAmountCents ?? 0
	);
	const netDueCents = Math.max(
		managedBooking.totalPriceCents - (managedBooking.refundAmountCents ?? 0),
		0
	);

	let nextPaymentStatus: typeof managedBooking.paymentStatus = "unpaid";
	if (capturedAmountCents <= 0) {
		nextPaymentStatus =
			managedBooking.paymentStatus === "failed" ? "failed" : "unpaid";
	} else if (capturedAmountCents >= netDueCents) {
		nextPaymentStatus = netDueCents === 0 ? "refunded" : "paid";
	} else {
		nextPaymentStatus = "partially_paid";
	}

	await db
		.update(booking)
		.set({
			paymentStatus: nextPaymentStatus,
			updatedAt: new Date(),
		})
		.where(eq(booking.id, managedBooking.id));

	return {
		bookingId: managedBooking.id,
		capturedAmountCents,
		netDueCents,
		paymentStatus: nextPaymentStatus,
	};
};
