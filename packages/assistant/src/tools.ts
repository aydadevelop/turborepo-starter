import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { tool } from "ai";
import z from "zod";

import type { AppRouterClient } from "@full-stack-cf-app/api/routers";

const createServerClient = (params: {
	serverUrl: string;
	requestHeaders: Headers;
}): AppRouterClient => {
	const cookie = params.requestHeaders.get("cookie") ?? "";
	const activeOrgId =
		params.requestHeaders.get("x-active-organization-id") ?? "";

	const link = new RPCLink({
		url: `${params.serverUrl}/rpc`,
		fetch(request, init) {
			const forwarded = new Request(request, init);
			if (cookie) {
				forwarded.headers.set("cookie", cookie);
			}
			if (activeOrgId) {
				forwarded.headers.set("x-active-organization-id", activeOrgId);
			}
			return fetch(forwarded);
		},
	});

	return createORPCClient(link);
};

export const createAssistantTools = (params: {
	serverUrl: string;
	requestHeaders: Headers;
}) => {
	const client = createServerClient(params);

	return {
		searchAvailableBoats: tool({
			description:
				"Search for available boats by date and duration or date range. Returns boats with pricing and availability.",
			inputSchema: z.object({
				date: z
					.string()
					.describe("Date in YYYY-MM-DD format to search availability"),
				durationHours: z
					.number()
					.min(0.5)
					.max(24)
					.describe("Desired rental duration in hours"),
				passengers: z
					.number()
					.int()
					.min(1)
					.max(500)
					.default(1)
					.describe("Number of passengers"),
				search: z
					.string()
					.optional()
					.describe("Optional search term to filter boats by name"),
			}),
			execute: async ({ date, durationHours, passengers, search }) => {
				const result = await client.booking.availabilityPublic({
					date,
					durationHours,
					passengers,
					search,
					withSlots: true,
					limit: 10,
					offset: 0,
					sortBy: "availability_bands",
				});

				return {
					total: result.total,
					boats: result.items.map((item) => ({
						id: item.boat.id,
						name: item.boat.name,
						type: item.boat.type,
						passengerCapacity: item.boat.passengerCapacity,
						available: item.available,
						estimatedTotalPrice:
							item.pricingQuote?.estimatedTotalPriceCents ?? null,
						currency: item.pricingQuote?.currency ?? null,
						slotCount: item.slots?.length ?? 0,
						availableSlots:
							item.slots?.slice(0, 5).map((slot) => ({
								startsAt: slot.startsAt.toISOString(),
								endsAt: slot.endsAt.toISOString(),
								priceCents: slot.totalPriceCents,
							})) ?? [],
					})),
				};
			},
		}),

		getBoatDetails: tool({
			description:
				"Get detailed information about a specific boat including amenities, dock, gallery, pricing, and available time slots for a given date.",
			inputSchema: z.object({
				boatId: z.string().describe("The boat ID to look up"),
				date: z
					.string()
					.optional()
					.describe(
						"Date in YYYY-MM-DD format to check slots (defaults to today)"
					),
				passengers: z
					.number()
					.int()
					.min(1)
					.default(1)
					.describe("Number of passengers for pricing"),
				durationHours: z
					.number()
					.min(0.5)
					.max(24)
					.default(1)
					.describe("Duration in hours for slot computation"),
			}),
			execute: async ({ boatId, date, passengers, durationHours }) => {
				const result = await client.booking.getByIdPublic({
					boatId,
					date,
					passengers,
					durationHours,
				});

				return {
					boat: {
						id: result.boat.id,
						name: result.boat.name,
						type: result.boat.type,
						description: result.boat.description,
						passengerCapacity: result.boat.passengerCapacity,
						minimumHours: result.boat.minimumHours,
						timezone: result.boat.timezone,
					},
					dock: result.dock
						? {
								name: result.dock.name,
								address: result.dock.address,
							}
						: null,
					amenities: result.amenities.map((a) => ({
						key: a.key,
						label: a.label,
					})),
					pricing: result.pricingQuote
						? {
								estimatedTotal:
									result.pricingQuote.estimatedTotalPriceCents,
								currency: result.pricingQuote.currency,
								basePrice: result.pricingQuote.estimatedBasePriceCents,
							}
						: null,
					availableSlots: result.slots.slice(0, 10).map((slot) => ({
						startsAt: slot.startsAt.toISOString(),
						endsAt: slot.endsAt.toISOString(),
						priceCents: slot.totalPriceCents,
					})),
					totalSlots: result.slots.length,
				};
			},
		}),

		getBookingQuote: tool({
			description:
				"Calculate a price quote for booking a specific boat for a time range, with optional discount code.",
			inputSchema: z.object({
				boatId: z.string().describe("The boat ID"),
				startsAt: z
					.string()
					.describe(
						"Start time in ISO 8601 format (e.g. 2026-03-15T10:00:00Z)"
					),
				endsAt: z
					.string()
					.describe(
						"End time in ISO 8601 format (e.g. 2026-03-15T13:00:00Z)"
					),
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
						totalPrice:
							result.pricingQuoteAfterDiscount.estimatedTotalPriceCents,
						payNow: result.pricingQuoteAfterDiscount.estimatedPayNowCents,
						payLater:
							result.pricingQuoteAfterDiscount.estimatedPayLaterCents,
					},
				};
			},
		}),
	};
};
