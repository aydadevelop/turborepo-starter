import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	listings: {
		items: [
			{
				id: "listing_1",
				listingTypeSlug: "boat-charter",
				listingTypeLabel: "Boat charter",
				serviceFamily: "boat_rent" as const,
				serviceFamilyPolicy: {
					key: "boat_rent" as const,
					label: "Boat rent",
					availabilityMode: "duration" as const,
					operatorSections: [
						"basics",
						"pricing",
						"availability",
						"assets",
						"calendar",
						"publish",
					],
					defaults: {
						moderationRequired: false,
						requiresLocation: true,
					},
					customerPresentation: {
						bookingMode: "request" as const,
						customerFocus: "asset" as const,
						reviewsMode: "standard" as const,
					},
				},
				name: "Evening Charter",
				slug: "evening-charter",
				description: "Sunset ride along the marina.",
				metadata: {},
				primaryImageUrl: null,
				createdAt: "2026-03-12T00:00:00.000Z",
				boatRentSummary: {
					basePort: "Sochi Marine Station",
					capacity: 10,
					captainMode: "captained_only" as const,
					captainModeLabel: "Captain included",
					departureArea: "Imeretinskaya Bay",
					depositRequired: true,
					fuelPolicy: "included" as const,
					fuelPolicyLabel: "Fuel included",
					instantBookAllowed: false,
				},
				excursionSummary: null,
			},
			{
				id: "listing_2",
				listingTypeSlug: "walking-tour",
				listingTypeLabel: "Walking tour",
				serviceFamily: "excursions" as const,
				serviceFamilyPolicy: {
					key: "excursions" as const,
					label: "Excursions",
					availabilityMode: "schedule" as const,
					operatorSections: [
						"basics",
						"pricing",
						"availability",
						"assets",
						"publish",
					],
					defaults: {
						moderationRequired: true,
						requiresLocation: true,
					},
					customerPresentation: {
						bookingMode: "request" as const,
						customerFocus: "experience" as const,
						reviewsMode: "validated" as const,
					},
				},
				name: "Historic Center Walk",
				slug: "historic-center-walk",
				description: "A guided walk through the old city.",
				metadata: {},
				primaryImageUrl: null,
				createdAt: "2026-03-12T00:00:00.000Z",
				boatRentSummary: null,
				excursionSummary: {
					meetingPoint: "Main square",
					durationMinutes: 180,
					durationLabel: "3 hours",
					groupFormat: "group" as const,
					groupFormatLabel: "Group tour",
					maxGroupSize: 12,
					primaryLanguage: "Russian",
					ticketsIncluded: true,
					childFriendly: true,
					instantBookAllowed: false,
				},
			},
		],
		total: 2,
	},
}));

vi.mock("$app/state", () => ({
	page: {
		url: new URL("http://localhost/listings"),
		pathname: "/listings",
		search: "",
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		storefront: {
			list: {
				queryOptions: () => ({
					queryKey: ["storefront", "list"],
					queryFn: async () => mockState.listings,
				}),
			},
		},
	},
}));

import StorefrontListingsPage from "../../routes/(public)/listings/+page.svelte";

test("renders the public storefront listings page with a loaded-state screenshot", async () => {
	renderWithQueryClient(StorefrontListingsPage);

	await expect
		.element(page.getByRole("heading", { name: "Browse Listings" }))
		.toBeVisible();
	await expect.element(page.getByText("Evening Charter")).toBeVisible();
	await expect.element(page.getByText("Historic Center Walk")).toBeVisible();
	await expect(document.body).toMatchScreenshot("storefront-listings-page");
});
