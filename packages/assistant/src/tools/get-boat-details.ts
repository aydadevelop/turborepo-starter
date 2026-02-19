import type { AppRouterClient } from "@full-stack-cf-app/api/routers";
import { tool } from "ai";
import z from "zod";

export const createGetBoatDetailsTool = (client: AppRouterClient) =>
	tool({
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
				boat: result.boat,
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
							estimatedTotal: result.pricingQuote.estimatedTotalPriceCents,
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
	});
