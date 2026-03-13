import {
	calculateQuoteFromResolvedPricing,
	type QuoteBreakdown,
	type ResolvedPricingContext,
} from "@my-app/pricing";
import type { PreparedPromotionPreviewContext } from "@my-app/promotions";
import type { PublicBookingSlotQuote } from "../types";
import { previewPreparedPromotion } from "./promotions";

export const toPublicQuote = (params: {
	quote: QuoteBreakdown;
	discountPreview: PublicBookingSlotQuote["discountPreview"];
}): PublicBookingSlotQuote => ({
	listingId: params.quote.listingId,
	profileId: params.quote.profileId,
	currency: params.quote.currency,
	durationMinutes: params.quote.durationMinutes,
	baseCents: params.quote.baseCents,
	adjustmentCents: params.quote.adjustmentCents,
	subtotalCents: params.quote.subtotalCents,
	serviceFeeCents: params.quote.serviceFeeCents,
	taxCents: params.quote.taxCents,
	totalCents: params.quote.totalCents,
	hasSpecialPricing: params.quote.adjustmentCents !== 0,
	discountPreview: params.discountPreview,
});

export const resolveSlotQuote = (params: {
	listingId: string;
	startsAt: Date;
	endsAt: Date;
	passengers?: number;
	pricingContext: ResolvedPricingContext | null;
	promotionContext: PreparedPromotionPreviewContext | null;
}): PublicBookingSlotQuote | null => {
	if (!params.pricingContext) {
		return null;
	}

	const quote = calculateQuoteFromResolvedPricing(
		{
			listingId: params.listingId,
			startsAt: params.startsAt,
			endsAt: params.endsAt,
			passengers: params.passengers,
		},
		params.pricingContext,
	);
	const discountPreview = previewPreparedPromotion(params.promotionContext, quote);

	return toPublicQuote({
		quote,
		discountPreview,
	});
};
