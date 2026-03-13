import { applyDiscountToQuote, type QuoteBreakdown } from "@my-app/pricing";
import { bookingDiscountCode } from "@my-app/db/schema/marketplace";
import { sql } from "drizzle-orm";

import {
	countCustomerApplicationsForDiscountCode,
	createDiscountCode,
	findDiscountCodeById,
	findDiscountCodeByOrganizationAndCode,
	incrementDiscountCodeUsage,
	insertDiscountApplication,
	listOrganizationDiscountCodes,
	updateDiscountCode,
} from "./repository";
import type {
	Db,
	DiscountCodeRow,
	PreparedPromotionPreviewContext,
	PromotionClaim,
	PromotionErrorCode,
	PromotionQuotePreview,
	PromotionResolution,
	PromotionResolutionInput,
} from "./types";

const PROMOTION_CODE_LENGTH = 64;

export function isPromotionErrorCode(
	value: string,
): value is PromotionErrorCode {
	return [
		"PROMOTION_CODE_NOT_FOUND",
		"PROMOTION_CODE_INACTIVE",
		"PROMOTION_CODE_NOT_STARTED",
		"PROMOTION_CODE_EXPIRED",
		"PROMOTION_CODE_LISTING_MISMATCH",
		"PROMOTION_CODE_USAGE_LIMIT_REACHED",
		"PROMOTION_CODE_CUSTOMER_LIMIT_REACHED",
		"PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET",
	].includes(value);
}

export function getPromotionErrorLabel(
	code: PromotionErrorCode,
): string {
	switch (code) {
		case "PROMOTION_CODE_NOT_FOUND":
			return "Discount code not found.";
		case "PROMOTION_CODE_INACTIVE":
			return "Discount code is inactive.";
		case "PROMOTION_CODE_NOT_STARTED":
			return "Discount code is not active yet.";
		case "PROMOTION_CODE_EXPIRED":
			return "Discount code has expired.";
		case "PROMOTION_CODE_LISTING_MISMATCH":
			return "Discount code does not apply to this listing.";
		case "PROMOTION_CODE_USAGE_LIMIT_REACHED":
			return "Discount code usage limit has been reached.";
		case "PROMOTION_CODE_CUSTOMER_LIMIT_REACHED":
			return "You have already used this discount code the maximum number of times.";
		case "PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET":
			return "This booking does not meet the minimum subtotal for the discount code.";
	}
}

export function normalizeDiscountCode(rawCode: string): string {
	return rawCode.trim().toUpperCase().slice(0, PROMOTION_CODE_LENGTH);
}

function buildInvalidResolution(
	code: string,
	reasonCode: PromotionErrorCode,
): PromotionResolution {
	return {
		code,
		discountCodeId: null,
		name: null,
		description: null,
		discountType: null,
		discountValue: null,
		maxDiscountCents: null,
		minimumSubtotalCents: null,
		status: "invalid",
		reasonCode,
		reasonLabel: getPromotionErrorLabel(reasonCode),
		appliedAmountCents: 0,
	};
}

function calculateAppliedAmount(
	discountCode: Pick<
		DiscountCodeRow,
		"discountType" | "discountValue" | "maxDiscountCents"
	>,
	subtotalCents: number,
): number {
	const rawAmount =
		discountCode.discountType === "percentage"
			? Math.round((subtotalCents * discountCode.discountValue) / 100)
			: discountCode.discountValue;

	if (discountCode.maxDiscountCents !== null) {
		return Math.min(rawAmount, discountCode.maxDiscountCents, subtotalCents);
	}

	return Math.min(rawAmount, subtotalCents);
}

export async function preparePromotionPreviewContext(
	input: Omit<PromotionResolutionInput, "subtotalCents">,
	db: Db,
): Promise<PreparedPromotionPreviewContext> {
	const normalizedCode = normalizeDiscountCode(input.discountCode);
	if (!normalizedCode) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_NOT_FOUND",
			),
		};
	}

	const discountCode = await findDiscountCodeByOrganizationAndCode(
		input.organizationId,
		normalizedCode,
		db,
	);

	if (!discountCode) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_NOT_FOUND",
			),
		};
	}

	const now = input.now ?? new Date();

	if (!discountCode.isActive) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_INACTIVE",
			),
		};
	}

	if (discountCode.validFrom && now < discountCode.validFrom) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_NOT_STARTED",
			),
		};
	}

	if (discountCode.validTo && now > discountCode.validTo) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_EXPIRED",
			),
		};
	}

	if (
		discountCode.appliesToListingId &&
		discountCode.appliesToListingId !== input.listingId
	) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_LISTING_MISMATCH",
			),
		};
	}

	if (
		discountCode.usageLimit !== null &&
		discountCode.usageCount >= discountCode.usageLimit
	) {
		return {
			status: "invalid",
			resolution: buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_USAGE_LIMIT_REACHED",
			),
		};
	}

	if (input.customerUserId && discountCode.perCustomerLimit !== null) {
		const customerUsageCount =
			await countCustomerApplicationsForDiscountCode(
				discountCode.id,
				input.customerUserId,
				db,
			);
		if (customerUsageCount >= discountCode.perCustomerLimit) {
			return {
				status: "invalid",
				resolution: buildInvalidResolution(
					normalizedCode,
					"PROMOTION_CODE_CUSTOMER_LIMIT_REACHED",
				),
			};
		}
	}

	return {
		status: "ready",
		code: normalizedCode,
		discountCodeId: discountCode.id,
		name: discountCode.name,
		description: discountCode.description,
		discountType: discountCode.discountType,
		discountValue: discountCode.discountValue,
		maxDiscountCents: discountCode.maxDiscountCents,
		minimumSubtotalCents: discountCode.minimumSubtotalCents,
	};
}

export function previewPreparedPromotionForQuote(
	context: PreparedPromotionPreviewContext,
	quote: QuoteBreakdown,
): PromotionQuotePreview {
	if (context.status === "invalid") {
		return {
			...context.resolution,
			status: "invalid",
			quote,
		};
	}

	if (quote.subtotalCents < context.minimumSubtotalCents) {
		return {
			...buildInvalidResolution(
				context.code,
				"PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET",
			),
			status: "invalid",
			quote,
		};
	}

	const appliedAmountCents = calculateAppliedAmount(
		{
			discountType: context.discountType,
			discountValue: context.discountValue,
			maxDiscountCents: context.maxDiscountCents,
		},
		quote.subtotalCents,
	);

	return {
		code: context.code,
		discountCodeId: context.discountCodeId,
		name: context.name,
		description: context.description,
		discountType: context.discountType,
		discountValue: context.discountValue,
		maxDiscountCents: context.maxDiscountCents,
		minimumSubtotalCents: context.minimumSubtotalCents,
		status: "applied",
		reasonCode: null,
		reasonLabel: null,
		appliedAmountCents,
		quote: applyDiscountToQuote(quote, appliedAmountCents),
	};
}

async function resolvePromotion(
	input: PromotionResolutionInput,
	db: Db,
): Promise<PromotionResolution> {
	const normalizedCode = normalizeDiscountCode(input.discountCode);
	if (!normalizedCode) {
		return buildInvalidResolution(
			normalizedCode,
			"PROMOTION_CODE_NOT_FOUND",
		);
	}

	const discountCode = await findDiscountCodeByOrganizationAndCode(
		input.organizationId,
		normalizedCode,
		db,
	);

	if (!discountCode) {
		return buildInvalidResolution(
			normalizedCode,
			"PROMOTION_CODE_NOT_FOUND",
		);
	}

	const now = input.now ?? new Date();

	if (!discountCode.isActive) {
		return buildInvalidResolution(normalizedCode, "PROMOTION_CODE_INACTIVE");
	}

	if (discountCode.validFrom && now < discountCode.validFrom) {
		return buildInvalidResolution(
			normalizedCode,
			"PROMOTION_CODE_NOT_STARTED",
		);
	}

	if (discountCode.validTo && now > discountCode.validTo) {
		return buildInvalidResolution(normalizedCode, "PROMOTION_CODE_EXPIRED");
	}

	if (
		discountCode.appliesToListingId &&
		discountCode.appliesToListingId !== input.listingId
	) {
		return buildInvalidResolution(
			normalizedCode,
			"PROMOTION_CODE_LISTING_MISMATCH",
		);
	}

	if (
		discountCode.usageLimit !== null &&
		discountCode.usageCount >= discountCode.usageLimit
	) {
		return buildInvalidResolution(
			normalizedCode,
			"PROMOTION_CODE_USAGE_LIMIT_REACHED",
		);
	}

	if (input.customerUserId && discountCode.perCustomerLimit !== null) {
		const customerUsageCount =
			await countCustomerApplicationsForDiscountCode(
				discountCode.id,
				input.customerUserId,
				db,
			);
		if (customerUsageCount >= discountCode.perCustomerLimit) {
			return buildInvalidResolution(
				normalizedCode,
				"PROMOTION_CODE_CUSTOMER_LIMIT_REACHED",
			);
		}
	}

	if (input.subtotalCents < discountCode.minimumSubtotalCents) {
		return buildInvalidResolution(
			normalizedCode,
			"PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET",
		);
	}

	return {
		code: normalizedCode,
		discountCodeId: discountCode.id,
		name: discountCode.name,
		description: discountCode.description,
		discountType: discountCode.discountType,
		discountValue: discountCode.discountValue,
		maxDiscountCents: discountCode.maxDiscountCents,
		minimumSubtotalCents: discountCode.minimumSubtotalCents,
		status: "applied",
		reasonCode: null,
		reasonLabel: null,
		appliedAmountCents: calculateAppliedAmount(
			discountCode,
			input.subtotalCents,
		),
	};
}

export async function previewPromotionForQuote(
	input: PromotionResolutionInput & {
		quote: QuoteBreakdown;
	},
	db: Db,
): Promise<PromotionQuotePreview> {
	const context = await preparePromotionPreviewContext(
		{
			organizationId: input.organizationId,
			listingId: input.listingId,
			discountCode: input.discountCode,
			customerUserId: input.customerUserId,
			now: input.now,
		},
		db,
	);

	return previewPreparedPromotionForQuote(context, input.quote);
}

export async function resolvePromotionUsageForBooking(
	input: PromotionResolutionInput,
	db: Db,
): Promise<PromotionClaim> {
	const normalizedCode = normalizeDiscountCode(input.discountCode);
	if (!normalizedCode) {
		throw new Error("PROMOTION_CODE_NOT_FOUND");
	}

	const initialCode = await findDiscountCodeByOrganizationAndCode(
		input.organizationId,
		normalizedCode,
		db,
	);

	if (!initialCode) {
		throw new Error("PROMOTION_CODE_NOT_FOUND");
	}

	await db.execute(
		sql`select 1 from ${bookingDiscountCode} where ${bookingDiscountCode.id} = ${initialCode.id} for update`,
	);

	const lockedCode = await findDiscountCodeById(initialCode.id, db);
	if (!lockedCode) {
		throw new Error("PROMOTION_CODE_NOT_FOUND");
	}

	const resolution = await resolvePromotion(
		{
			organizationId: input.organizationId,
			listingId: input.listingId,
			discountCode: normalizedCode,
			customerUserId: input.customerUserId,
			subtotalCents: input.subtotalCents,
			now: input.now,
		},
		db,
	);

	if (resolution.status !== "applied") {
		throw new Error(resolution.reasonCode ?? "PROMOTION_CODE_NOT_FOUND");
	}

	return {
		application: {
			...resolution,
			discountCodeId: lockedCode.id,
			discountType: lockedCode.discountType,
			discountValue: lockedCode.discountValue,
		},
	};
}

export async function recordPromotionUsage(
	input: {
		bookingId: string;
		customerUserId?: string;
		promotion: PromotionClaim;
	},
	db: Db,
): Promise<void> {
	await insertDiscountApplication(
		{
			id: crypto.randomUUID(),
			bookingId: input.bookingId,
			discountCodeId: input.promotion.application.discountCodeId,
			customerUserId: input.customerUserId,
			code: input.promotion.application.code,
			discountType: input.promotion.application.discountType,
			discountValue: input.promotion.application.discountValue,
			appliedAmountCents: input.promotion.application.appliedAmountCents,
		},
		db,
	);
	await incrementDiscountCodeUsage(
		input.promotion.application.discountCodeId,
		db,
	);
}

export async function listPromotionsForOrganization(
	organizationId: string,
	db: Db,
) {
	return listOrganizationDiscountCodes(organizationId, db);
}

export async function upsertPromotion(
	input: {
		id?: string;
		organizationId: string;
		code: string;
		name: string;
		description?: string;
		discountType: DiscountCodeRow["discountType"];
		discountValue: number;
		maxDiscountCents?: number | null;
		minimumSubtotalCents?: number;
		validFrom?: Date | null;
		validTo?: Date | null;
		usageLimit?: number | null;
		perCustomerLimit?: number | null;
		appliesToListingId?: string | null;
		isActive?: boolean;
		createdByUserId?: string | null;
		metadata?: Record<string, unknown> | null;
	},
	db: Db,
) {
	const normalizedCode = normalizeDiscountCode(input.code);
	if (!normalizedCode) {
		throw new Error("PROMOTION_CODE_NOT_FOUND");
	}

	const values = {
		code: normalizedCode,
		name: input.name,
		description: input.description ?? null,
		discountType: input.discountType,
		discountValue: input.discountValue,
		maxDiscountCents: input.maxDiscountCents ?? null,
		minimumSubtotalCents: input.minimumSubtotalCents ?? 0,
		validFrom: input.validFrom ?? null,
		validTo: input.validTo ?? null,
		usageLimit: input.usageLimit ?? null,
		perCustomerLimit: input.perCustomerLimit ?? null,
		appliesToListingId: input.appliesToListingId ?? null,
		isActive: input.isActive ?? true,
		metadata: input.metadata ?? null,
	};

	if (!input.id) {
		return createDiscountCode(
			{
				id: crypto.randomUUID(),
				organizationId: input.organizationId,
				createdByUserId: input.createdByUserId ?? null,
				usageCount: 0,
				...values,
			},
			db,
		);
	}

	return updateDiscountCode(input.id, input.organizationId, values, db);
}

export async function setPromotionActive(
	input: {
		id: string;
		organizationId: string;
		isActive: boolean;
	},
	db: Db,
) {
	return updateDiscountCode(
		input.id,
		input.organizationId,
		{ isActive: input.isActive },
		db,
	);
}
