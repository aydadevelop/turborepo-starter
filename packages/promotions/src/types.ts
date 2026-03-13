import type { db } from "@my-app/db";
import type {
	bookingDiscountApplication,
	bookingDiscountCode,
} from "@my-app/db/schema/marketplace";
import type { DiscountedQuoteBreakdown, QuoteBreakdown } from "@my-app/pricing";

export type Db = typeof db;
export type DiscountCodeRow = typeof bookingDiscountCode.$inferSelect;
export type DiscountApplicationRow = typeof bookingDiscountApplication.$inferSelect;

export const promotionErrorCodes = [
	"PROMOTION_CODE_NOT_FOUND",
	"PROMOTION_CODE_INACTIVE",
	"PROMOTION_CODE_NOT_STARTED",
	"PROMOTION_CODE_EXPIRED",
	"PROMOTION_CODE_LISTING_MISMATCH",
	"PROMOTION_CODE_USAGE_LIMIT_REACHED",
	"PROMOTION_CODE_CUSTOMER_LIMIT_REACHED",
	"PROMOTION_CODE_MINIMUM_SUBTOTAL_NOT_MET",
] as const;

export type PromotionErrorCode = (typeof promotionErrorCodes)[number];

export interface PromotionResolutionInput {
	organizationId: string;
	listingId: string;
	discountCode: string;
	customerUserId?: string;
	subtotalCents: number;
	now?: Date;
}

export interface PromotionResolution {
	code: string;
	discountCodeId: string | null;
	name: string | null;
	description: string | null;
	discountType: DiscountCodeRow["discountType"] | null;
	discountValue: number | null;
	maxDiscountCents: number | null;
	minimumSubtotalCents: number | null;
	status: "applied" | "invalid";
	reasonCode: PromotionErrorCode | null;
	reasonLabel: string | null;
	appliedAmountCents: number;
}

export type PromotionQuotePreview =
	| (PromotionResolution & {
			status: "applied";
			quote: DiscountedQuoteBreakdown;
	  })
	| (PromotionResolution & {
			status: "invalid";
			quote: QuoteBreakdown;
	  });

export interface PromotionClaim {
	application: PromotionResolution & {
		discountCodeId: string;
		discountType: DiscountCodeRow["discountType"];
		discountValue: number;
	};
}

export type PreparedPromotionPreviewContext =
	| {
			status: "invalid";
			resolution: PromotionResolution;
	  }
	| {
			status: "ready";
			code: string;
			discountCodeId: string;
			name: string;
			description: string | null;
			discountType: DiscountCodeRow["discountType"];
			discountValue: number;
			maxDiscountCents: number | null;
			minimumSubtotalCents: number;
	  };
