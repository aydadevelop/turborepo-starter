import type { boat } from "@full-stack-cf-app/db/schema/boat";
import type { BookingPricingQuote } from "../../booking/pricing";
import {
	checkoutLineItemLabels,
	checkoutPolicyTemplates,
} from "./checkout-read-model.templates";

interface CheckoutDiscount {
	normalizedDiscountCode: string;
	discountType: "percentage" | "fixed_cents";
	discountValue: number;
	discountAmountCents: number;
}

type CheckoutBoatProjection = typeof boat.$inferSelect;

const formatMoney = (amountCents: number, currency: string, locale: string) =>
	new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(amountCents / 100);

const formatDateInZone = (value: Date, timeZone: string, locale: string) =>
	new Intl.DateTimeFormat(locale, {
		timeZone,
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(value);

export const buildCheckoutReadModel = (params: {
	boat: CheckoutBoatProjection;
	startsAt: Date;
	endsAt: Date;
	passengers: number;
	locale: string;
	pricingQuote: BookingPricingQuote;
	pricingQuoteAfterDiscount: BookingPricingQuote;
	discount: CheckoutDiscount | null;
}) => {
	const currency = params.pricingQuoteAfterDiscount.currency;
	const discountAmountCents = params.discount?.discountAmountCents ?? 0;
	const lineItems = [
		{
			key: "base_subtotal",
			label: checkoutLineItemLabels.baseSubtotal,
			amountCents: params.pricingQuote.estimatedBasePriceCents,
			formattedAmount: formatMoney(
				params.pricingQuote.estimatedBasePriceCents,
				currency,
				params.locale
			),
			dueAt: "later" as const,
		},
		...(discountAmountCents > 0
			? [
					{
						key: "discount",
						label: checkoutLineItemLabels.discount,
						amountCents: -discountAmountCents,
						formattedAmount: `-${formatMoney(
							discountAmountCents,
							currency,
							params.locale
						)}`,
						dueAt: "later" as const,
					},
				]
			: []),
		{
			key: "service_fee",
			label: checkoutLineItemLabels.serviceFee,
			amountCents: params.pricingQuoteAfterDiscount.estimatedServiceFeeCents,
			formattedAmount: formatMoney(
				params.pricingQuoteAfterDiscount.estimatedServiceFeeCents,
				currency,
				params.locale
			),
			dueAt: "now" as const,
		},
		{
			key: "affiliate_fee",
			label: checkoutLineItemLabels.affiliateFee,
			amountCents: params.pricingQuoteAfterDiscount.estimatedAffiliateFeeCents,
			formattedAmount: formatMoney(
				params.pricingQuoteAfterDiscount.estimatedAffiliateFeeCents,
				currency,
				params.locale
			),
			dueAt: "now" as const,
		},
		{
			key: "pay_now",
			label: checkoutLineItemLabels.payNow,
			amountCents: params.pricingQuoteAfterDiscount.estimatedPayNowCents,
			formattedAmount: formatMoney(
				params.pricingQuoteAfterDiscount.estimatedPayNowCents,
				currency,
				params.locale
			),
			dueAt: "now" as const,
		},
		{
			key: "pay_later",
			label: checkoutLineItemLabels.payLater,
			amountCents: params.pricingQuoteAfterDiscount.estimatedPayLaterCents,
			formattedAmount: formatMoney(
				params.pricingQuoteAfterDiscount.estimatedPayLaterCents,
				currency,
				params.locale
			),
			dueAt: "later" as const,
		},
		{
			key: "total",
			label: checkoutLineItemLabels.total,
			amountCents: params.pricingQuoteAfterDiscount.estimatedTotalPriceCents,
			formattedAmount: formatMoney(
				params.pricingQuoteAfterDiscount.estimatedTotalPriceCents,
				currency,
				params.locale
			),
			dueAt: "total" as const,
		},
	];

	const policies = [
		checkoutPolicyTemplates.payment,
		checkoutPolicyTemplates.cancellation,
		{
			key: "minimum_notice",
			title: "Minimum notice",
			description: `${params.boat.minimumNoticeMinutes} minutes before departure.`,
		},
	];

	const totalCents = params.pricingQuoteAfterDiscount.estimatedTotalPriceCents;
	const payNowCents = params.pricingQuoteAfterDiscount.estimatedPayNowCents;
	const payLaterCents = params.pricingQuoteAfterDiscount.estimatedPayLaterCents;

	return {
		lineItems,
		policies,
		totals: {
			totalCents,
			payNowCents,
			payLaterCents,
			totalFormatted: formatMoney(totalCents, currency, params.locale),
			payNowFormatted: formatMoney(payNowCents, currency, params.locale),
			payLaterFormatted: formatMoney(payLaterCents, currency, params.locale),
		},
		itinerary: {
			timezone: params.boat.timezone,
			startsAt: params.startsAt,
			endsAt: params.endsAt,
			startsAtLabel: formatDateInZone(
				params.startsAt,
				params.boat.timezone,
				params.locale
			),
			endsAtLabel: formatDateInZone(
				params.endsAt,
				params.boat.timezone,
				params.locale
			),
			durationHours:
				(params.endsAt.getTime() - params.startsAt.getTime()) / 3_600_000,
			passengers: params.passengers,
		},
	};
};
