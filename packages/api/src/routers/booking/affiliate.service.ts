import { db } from "@full-stack-cf-app/db";
import {
	affiliateReferral,
	bookingAffiliateAttribution,
	bookingAffiliatePayout,
} from "@full-stack-cf-app/db/schema/affiliate";
import { booking, bookingRefund } from "@full-stack-cf-app/db/schema/booking";
import { and, eq } from "drizzle-orm";

import type { Context } from "../../context";

export const AFFILIATE_REFERRAL_COOKIE_NAME = "affiliate_ref";

const affiliateReferralCookieFallbackNames = [
	AFFILIATE_REFERRAL_COOKIE_NAME,
	"affiliate",
	"ref",
] as const;

const affiliateReferralCodeRegex = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

export const normalizeAffiliateReferralCode = (
	value: string
): string | null => {
	const normalized = value.trim().toUpperCase();
	if (!affiliateReferralCodeRegex.test(normalized)) {
		return null;
	}
	return normalized;
};

const resolveReferralCodeFromCookies = (
	cookies: Readonly<Record<string, string>> | undefined
) => {
	if (!cookies) {
		return null;
	}

	for (const cookieName of affiliateReferralCookieFallbackNames) {
		const value = cookies[cookieName];
		if (!value) {
			continue;
		}
		const normalized = normalizeAffiliateReferralCode(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
};

export const resolveAffiliateReferralFromContext = async (
	context: Pick<Context, "requestCookies">
) => {
	const referralCode = resolveReferralCodeFromCookies(context.requestCookies);
	if (!referralCode) {
		return null;
	}

	const [referral] = await db
		.select()
		.from(affiliateReferral)
		.where(
			and(
				eq(affiliateReferral.code, referralCode),
				eq(affiliateReferral.status, "active")
			)
		)
		.limit(1);

	return referral ?? null;
};

export const attachAffiliateAttributionToBooking = async (params: {
	bookingId: string;
	organizationId: string;
	currency: string;
	referral: typeof affiliateReferral.$inferSelect;
	commissionAmountCents: number;
	now?: Date;
	metadata?: string | null;
}) => {
	const now = params.now ?? new Date();
	const attributionId = crypto.randomUUID();
	const payoutId = crypto.randomUUID();

	await db.insert(bookingAffiliateAttribution).values({
		id: attributionId,
		bookingId: params.bookingId,
		organizationId: params.organizationId,
		affiliateUserId: params.referral.affiliateUserId,
		referralId: params.referral.id,
		referralCode: params.referral.code,
		source: "cookie",
		clickedAt: now,
		metadata: params.metadata ?? null,
		createdAt: now,
		updatedAt: now,
	});

	await db.insert(bookingAffiliatePayout).values({
		id: payoutId,
		attributionId,
		bookingId: params.bookingId,
		organizationId: params.organizationId,
		affiliateUserId: params.referral.affiliateUserId,
		commissionAmountCents: Math.max(0, params.commissionAmountCents),
		currency: params.currency,
		status: "pending",
		metadata: null,
		createdAt: now,
		updatedAt: now,
	});
};

const resolveNextAffiliatePayoutStatus = (params: {
	bookingStatus: (typeof booking.$inferSelect)["status"];
	paymentStatus: (typeof booking.$inferSelect)["paymentStatus"];
	hasProcessedRefund: boolean;
	currentStatus: (typeof bookingAffiliatePayout.$inferSelect)["status"];
}) => {
	if (params.currentStatus === "paid") {
		return {
			status: params.currentStatus,
			voidReason: null,
		} as const;
	}

	if (params.bookingStatus === "cancelled") {
		return { status: "voided", voidReason: "booking_cancelled" } as const;
	}

	if (params.paymentStatus === "refunded" || params.hasProcessedRefund) {
		return { status: "voided", voidReason: "booking_refunded" } as const;
	}

	if (
		params.bookingStatus === "completed" &&
		params.paymentStatus === "paid" &&
		!params.hasProcessedRefund
	) {
		return { status: "eligible", voidReason: null } as const;
	}

	return { status: "pending", voidReason: null } as const;
};

export const reconcileAffiliatePayoutForBooking = async (params: {
	bookingId: string;
	now?: Date;
}) => {
	const now = params.now ?? new Date();

	const [currentPayout] = await db
		.select()
		.from(bookingAffiliatePayout)
		.where(eq(bookingAffiliatePayout.bookingId, params.bookingId))
		.limit(1);

	if (!currentPayout) {
		return null;
	}

	const [bookingRow] = await db
		.select({
			id: booking.id,
			status: booking.status,
			paymentStatus: booking.paymentStatus,
		})
		.from(booking)
		.where(eq(booking.id, params.bookingId))
		.limit(1);

	if (!bookingRow) {
		return null;
	}

	const [processedRefund] = await db
		.select({ id: bookingRefund.id })
		.from(bookingRefund)
		.where(
			and(
				eq(bookingRefund.bookingId, params.bookingId),
				eq(bookingRefund.status, "processed")
			)
		)
		.limit(1);

	const hasProcessedRefund = Boolean(processedRefund);
	const next = resolveNextAffiliatePayoutStatus({
		bookingStatus: bookingRow.status,
		paymentStatus: bookingRow.paymentStatus,
		hasProcessedRefund,
		currentStatus: currentPayout.status,
	});

	if (next.status === currentPayout.status) {
		return currentPayout;
	}

	const nextValues: Partial<typeof bookingAffiliatePayout.$inferInsert> = {
		status: next.status,
		updatedAt: now,
	};

	if (next.status === "eligible") {
		nextValues.eligibleAt = currentPayout.eligibleAt ?? now;
		nextValues.voidedAt = null;
		nextValues.voidReason = null;
	} else if (next.status === "voided") {
		nextValues.voidedAt = now;
		nextValues.voidReason = next.voidReason;
		if (currentPayout.status !== "paid") {
			nextValues.paidAt = null;
		}
	} else {
		nextValues.eligibleAt = null;
		nextValues.voidedAt = null;
		nextValues.voidReason = null;
	}

	await db
		.update(bookingAffiliatePayout)
		.set(nextValues)
		.where(eq(bookingAffiliatePayout.id, currentPayout.id));

	const [updatedPayout] = await db
		.select()
		.from(bookingAffiliatePayout)
		.where(eq(bookingAffiliatePayout.id, currentPayout.id))
		.limit(1);

	return updatedPayout ?? currentPayout;
};
