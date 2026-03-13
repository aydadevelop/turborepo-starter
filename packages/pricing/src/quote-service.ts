import { resolveDefaultPricingContext } from "./pricing-profile";
import { resolveApplicableRules } from "./rule-resolver";
import type {
	Db,
	DiscountedQuoteBreakdown,
	QuoteBreakdown,
	QuoteInput,
	ResolvedPricingContext,
} from "./types";

export function applyDiscountToQuote(
	quote: QuoteBreakdown,
	discountAmountCents: number,
): DiscountedQuoteBreakdown {
	const normalizedDiscount = Math.max(
		0,
		Math.min(discountAmountCents, quote.subtotalCents),
	);
	const discountedSubtotalCents = Math.max(
		0,
		quote.subtotalCents - normalizedDiscount,
	);
	const discountedServiceFeeCents = Math.round(
		(discountedSubtotalCents * quote.pricingFactors.serviceFeeBps) / 10000,
	);
	const discountedTaxCents = Math.round(
		((discountedSubtotalCents + discountedServiceFeeCents) *
			quote.pricingFactors.taxBps) /
			10000,
	);
	const discountedTotalCents =
		discountedSubtotalCents +
		discountedServiceFeeCents +
		discountedTaxCents;

	return {
		...quote,
		discountAmountCents: normalizedDiscount,
		discountedSubtotalCents,
		discountedServiceFeeCents,
		discountedTaxCents,
		discountedTotalCents,
	};
}

export async function calculateQuote(
	input: QuoteInput,
	db: Db,
): Promise<QuoteBreakdown> {
	const context = await resolveDefaultPricingContext(input.listingId, db);
	if (!context) throw new Error("NO_PRICING_PROFILE");

	return calculateQuoteFromResolvedPricing(input, context);
}

export function calculateQuoteFromResolvedPricing(
	input: QuoteInput,
	context: ResolvedPricingContext,
): QuoteBreakdown {
	const { profile, rules } = context;

	const durationMinutes = Math.round(
		(input.endsAt.getTime() - input.startsAt.getTime()) / 60000,
	);
	const baseCents = Math.round(
		(profile.baseHourlyPriceCents * durationMinutes) / 60,
	);

	const passengerCount = input.passengers ?? 0;
	const bookingDayOfWeek = input.startsAt.getUTCDay();

	const applicable = resolveApplicableRules(rules, (rule) => {
		const cond = rule.conditionJson;
		if (cond.alwaysApply) return true;
		if (Array.isArray(cond.days) && !cond.days.includes(bookingDayOfWeek)) return false;
		if (
			typeof cond.minPassengers === "number" &&
			passengerCount < cond.minPassengers
		)
			return false;
		if (
			typeof cond.minDurationMinutes === "number" &&
			durationMinutes < cond.minDurationMinutes
		)
			return false;
		return true;
	});

	let adjustmentCents = 0;
	for (const rule of applicable) {
		if (rule.adjustmentType === "percent") {
			adjustmentCents += Math.round((baseCents * rule.adjustmentValue) / 100);
		} else {
			adjustmentCents += rule.adjustmentValue;
		}
	}

	const subtotalCents = baseCents + adjustmentCents;
	const serviceFeeCents = Math.round(
		(subtotalCents * profile.serviceFeeBps) / 10000,
	);
	const taxCents = Math.round(
		((subtotalCents + serviceFeeCents) * profile.taxBps) / 10000,
	);
	const totalCents = subtotalCents + serviceFeeCents + taxCents;

	return {
		listingId: input.listingId,
		profileId: profile.id,
		currency: profile.currency,
		durationMinutes,
		baseCents,
		adjustmentCents,
		subtotalCents,
		serviceFeeCents,
		taxCents,
		totalCents,
		pricingFactors: {
			serviceFeeBps: profile.serviceFeeBps,
			taxBps: profile.taxBps,
		},
	};
}
