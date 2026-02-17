import { db } from "@full-stack-cf-app/db";
import {
	booking,
	bookingDiscountApplication,
	bookingDiscountCode,
} from "@full-stack-cf-app/db/schema/booking";
import { ORPCError } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import {
	isValidDiscountCode,
	normalizeDiscountCode,
} from "../../../contracts/booking";
import type { ResolvedBookingDiscount } from "../helpers";

export const calculateDiscountAmountCents = (params: {
	basePriceCents: number;
	discountType: "percentage" | "fixed_cents";
	discountValue: number;
	maxDiscountCents?: number | null;
}) => {
	let amount = 0;

	if (params.discountType === "percentage") {
		amount = Math.floor((params.basePriceCents * params.discountValue) / 100);
		if (
			params.maxDiscountCents !== undefined &&
			params.maxDiscountCents !== null
		) {
			amount = Math.min(amount, params.maxDiscountCents);
		}
	} else {
		amount = params.discountValue;
	}

	return Math.min(params.basePriceCents, Math.max(0, amount));
};

const findActiveDiscountCode = async (params: {
	organizationId: string;
	normalizedDiscountCode: string;
}) => {
	const [discountCode] = await db
		.select()
		.from(bookingDiscountCode)
		.where(
			and(
				eq(bookingDiscountCode.organizationId, params.organizationId),
				eq(bookingDiscountCode.code, params.normalizedDiscountCode),
				eq(bookingDiscountCode.isActive, true)
			)
		)
		.limit(1);

	if (!discountCode) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Discount code is invalid or inactive",
		});
	}

	return discountCode;
};

const validateDiscountCodeRules = (params: {
	discountCode: typeof bookingDiscountCode.$inferSelect;
	boatId: string;
	startsAt: Date;
	basePriceCents: number;
}) => {
	if (
		params.discountCode.appliesToBoatId &&
		params.discountCode.appliesToBoatId !== params.boatId
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Discount code does not apply to this boat",
		});
	}

	if (
		params.discountCode.validFrom &&
		params.startsAt < params.discountCode.validFrom
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Discount code is not active yet",
		});
	}

	if (
		params.discountCode.validTo &&
		params.startsAt > params.discountCode.validTo
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Discount code has expired",
		});
	}

	if (params.basePriceCents < params.discountCode.minimumSubtotalCents) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Booking subtotal is below discount minimum",
		});
	}

	if (
		params.discountCode.usageLimit !== null &&
		params.discountCode.usageLimit !== undefined &&
		params.discountCode.usageCount >= params.discountCode.usageLimit
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Discount code usage limit has been reached",
		});
	}
};

const validateDiscountCodePerCustomerLimit = async (params: {
	discountCode: typeof bookingDiscountCode.$inferSelect;
	customerUserId?: string;
}) => {
	if (!(params.discountCode.perCustomerLimit && params.customerUserId)) {
		return;
	}

	const [usage] = await db
		.select({
			count: count(),
		})
		.from(bookingDiscountApplication)
		.innerJoin(booking, eq(bookingDiscountApplication.bookingId, booking.id))
		.where(
			and(
				eq(bookingDiscountApplication.discountCodeId, params.discountCode.id),
				eq(booking.customerUserId, params.customerUserId)
			)
		);

	const customerUsageCount = Number(usage?.count ?? 0);
	if (customerUsageCount >= params.discountCode.perCustomerLimit) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Customer usage limit has been reached",
		});
	}
};

export const resolveBookingDiscount = async (params: {
	organizationId: string;
	boatId: string;
	startsAt: Date;
	basePriceCents: number;
	discountCode?: string;
	customerUserId?: string;
}): Promise<ResolvedBookingDiscount | null> => {
	if (!params.discountCode) {
		return null;
	}

	const normalizedCode = normalizeDiscountCode(params.discountCode);
	if (!isValidDiscountCode(normalizedCode)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Discount code format is invalid",
		});
	}

	const discountCode = await findActiveDiscountCode({
		organizationId: params.organizationId,
		normalizedDiscountCode: normalizedCode,
	});

	validateDiscountCodeRules({
		discountCode,
		boatId: params.boatId,
		startsAt: params.startsAt,
		basePriceCents: params.basePriceCents,
	});

	await validateDiscountCodePerCustomerLimit({
		discountCode,
		customerUserId: params.customerUserId,
	});

	return {
		discountCodeId: discountCode.id,
		discountType: discountCode.discountType,
		discountValue: discountCode.discountValue,
		discountAmountCents: calculateDiscountAmountCents({
			basePriceCents: params.basePriceCents,
			discountType: discountCode.discountType,
			discountValue: discountCode.discountValue,
			maxDiscountCents: discountCode.maxDiscountCents,
		}),
		normalizedDiscountCode: normalizedCode,
	};
};
