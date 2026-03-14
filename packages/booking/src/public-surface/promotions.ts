import type { QuoteBreakdown } from "@my-app/pricing";
import {
	type PreparedPromotionPreviewContext,
	preparePromotionPreviewContext,
	previewPreparedPromotionForQuote,
} from "@my-app/promotions";
import type { Db, PublicBookingSlotDiscountPreview } from "../types";

export const preparePromotionContext = async (
	input: {
		organizationId: string;
		listingId: string;
		discountCode?: string;
		customerUserId?: string;
		now?: Date;
	},
	db: Db,
): Promise<PreparedPromotionPreviewContext | null> => {
	if (!input.discountCode) {
		return null;
	}

	return await preparePromotionPreviewContext(
		{
			organizationId: input.organizationId,
			listingId: input.listingId,
			discountCode: input.discountCode,
			customerUserId: input.customerUserId,
			now: input.now,
		},
		db,
	);
};

export const previewPreparedPromotion = (
	context: PreparedPromotionPreviewContext | null,
	quote: QuoteBreakdown,
): PublicBookingSlotDiscountPreview | null => {
	if (!context) {
		return null;
	}

	const preview = previewPreparedPromotionForQuote(context, quote);
	return {
		code: preview.code,
		status: preview.status,
		reasonCode: preview.reasonCode,
		reasonLabel: preview.reasonLabel,
		appliedAmountCents: preview.appliedAmountCents,
		discountedSubtotalCents:
			preview.status === "applied"
				? preview.quote.discountedSubtotalCents
				: null,
		discountedServiceFeeCents:
			preview.status === "applied"
				? preview.quote.discountedServiceFeeCents
				: null,
		discountedTaxCents:
			preview.status === "applied" ? preview.quote.discountedTaxCents : null,
		discountedTotalCents:
			preview.status === "applied" ? preview.quote.discountedTotalCents : null,
	};
};
