import { tool } from "ai";
import z from "zod";

import type { AppRouterClient } from "@full-stack-cf-app/api/routers";

export const createGetBookingQuoteTool = (client: AppRouterClient) =>
	tool({
		description:
			"Calculate a price quote for booking a specific boat for a time range, with optional discount code.",
		inputSchema: z.object({
			boatId: z.string().describe("The boat ID"),
			startsAt: z
				.string()
				.describe("Start time in ISO 8601 format (e.g. 2026-03-15T10:00:00Z)"),
			endsAt: z
				.string()
				.describe("End time in ISO 8601 format (e.g. 2026-03-15T13:00:00Z)"),
			passengers: z.number().int().min(1).describe("Number of passengers"),
			discountCode: z
				.string()
				.optional()
				.describe("Optional discount code to apply"),
		}),
		execute: async ({
			boatId,
			startsAt,
			endsAt,
			passengers,
			discountCode,
		}) => {
			const result = await client.booking.quotePublic({
				boatId,
				startsAt: new Date(startsAt),
				endsAt: new Date(endsAt),
				passengers,
				discountCode,
			});

			return {
				boat: {
					id: result.boat.id,
					name: result.boat.name,
				},
				pricing: {
					basePrice: result.pricingQuote.estimatedBasePriceCents,
					totalPrice: result.pricingQuote.estimatedTotalPriceCents,
					payNow: result.pricingQuote.estimatedPayNowCents,
					payLater: result.pricingQuote.estimatedPayLaterCents,
					currency: result.pricingQuote.currency,
				},
				discount: result.discount
					? {
							code: result.discount.code,
							type: result.discount.discountType,
							amountCents: result.discount.discountAmountCents,
						}
					: null,
				afterDiscount: {
					totalPrice: result.pricingQuoteAfterDiscount.estimatedTotalPriceCents,
					payNow: result.pricingQuoteAfterDiscount.estimatedPayNowCents,
					payLater: result.pricingQuoteAfterDiscount.estimatedPayLaterCents,
				},
			};
		},
	});