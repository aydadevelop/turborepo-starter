import { tool } from "ai";
import z from "zod";

import type { AppRouterClient } from "@full-stack-cf-app/api/routers";

export const createSearchAvailableBoatsTool = (client: AppRouterClient) =>
	tool({
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
	});