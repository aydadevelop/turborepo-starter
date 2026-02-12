import { publicProcedure } from "../../index";
import {
	checkoutReadModelPublicOutputSchema,
	getPublicCheckoutReadModelInputSchema,
} from "../booking.schemas";
import { buildCheckoutReadModel } from "./checkout-read-model.service";
import { resolvePublicBookingQuote } from "./core";

export const checkoutBookingRouter = {
	checkoutReadModelPublic: publicProcedure
		.route({
			tags: ["Booking"],
			summary: "Get public checkout read model",
			description:
				"Build a checkout-focused read model with fee line items, payment split, policy summaries, and localized labels.",
		})
		.input(getPublicCheckoutReadModelInputSchema)
		.output(checkoutReadModelPublicOutputSchema)
		.handler(async ({ context, input }) => {
			const quote = await resolvePublicBookingQuote({
				context,
				input: {
					boatId: input.boatId,
					startsAt: input.startsAt,
					endsAt: input.endsAt,
					passengers: input.passengers,
					discountCode: input.discountCode,
				},
			});

			const readModel = buildCheckoutReadModel({
				boat: quote.publicBoat,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				passengers: input.passengers,
				locale: input.locale,
				pricingQuote: quote.pricingQuote,
				pricingQuoteAfterDiscount: quote.pricingQuoteAfterDiscount,
				discount: quote.resolvedDiscount
					? {
							normalizedDiscountCode:
								quote.resolvedDiscount.normalizedDiscountCode,
							discountType: quote.resolvedDiscount.discountType,
							discountValue: quote.resolvedDiscount.discountValue,
							discountAmountCents: quote.resolvedDiscount.discountAmountCents,
						}
					: null,
			});

			return {
				boat: quote.publicBoat,
				pricingQuote: quote.pricingQuote,
				pricingQuoteAfterDiscount: quote.pricingQuoteAfterDiscount,
				discount: quote.resolvedDiscount
					? {
							code: quote.resolvedDiscount.normalizedDiscountCode,
							discountType: quote.resolvedDiscount.discountType,
							discountValue: quote.resolvedDiscount.discountValue,
							discountAmountCents: quote.resolvedDiscount.discountAmountCents,
						}
					: null,
				lineItems: readModel.lineItems,
				policies: readModel.policies,
				totals: readModel.totals,
				itinerary: readModel.itinerary,
			};
		}),
};
