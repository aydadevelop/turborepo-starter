import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { renderWithQueryClient } from "../../../test/browser/render";
import type { ListingListItem, OrganizationOverlaySummary } from "$lib/orpc-types";

const mockState = vi.hoisted(() => ({
	overlay: {
		onboarding: {
			id: "onboarding-1",
			organizationId: "org-1",
			paymentConfigured: true,
			calendarConnected: true,
			listingPublished: false,
			isComplete: false,
			completedAt: null,
			lastRecalculatedAt: "2026-03-12T00:00:00.000Z",
			createdAt: "2026-03-12T00:00:00.000Z",
			updatedAt: "2026-03-12T00:00:00.000Z",
		},
		publishing: {
			totalListingCount: 2,
			draftListingCount: 1,
			publishedListingCount: 1,
			unpublishedListingCount: 1,
			activePublicationCount: 1,
			reviewPendingCount: 0,
		},
		moderation: {
			approvedListingCount: 1,
			reviewPendingCount: 0,
			unapprovedActiveListingCount: 1,
		},
		distribution: {
			listingsWithoutPublicationCount: 1,
			marketplacePublicationCount: 1,
			ownSitePublicationCount: 0,
		},
		blockers: {
			missingCalendarCount: 0,
			missingLocationCount: 1,
			missingPricingCount: 0,
			missingPrimaryImageCount: 1,
			totalBlockingIssues: 2,
		},
		manualOverrides: {
			activeCount: 0,
			items: [],
		},
	} satisfies OrganizationOverlaySummary,
	listings: {
		items: [
			{
				id: "listing_1",
				organizationId: "org_1",
				name: "Sea Explorer",
				slug: "sea-explorer",
				description: "Sunset boat charter",
				listingTypeSlug: "boat-charter",
				status: "active",
				isActive: true,
				metadata: null,
				timezone: "Europe/Moscow",
				createdAt: "2026-03-12T00:00:00.000Z",
				updatedAt: "2026-03-12T00:00:00.000Z",
			},
			{
				id: "listing_2",
				organizationId: "org_1",
				name: "Historic Walk",
				slug: "historic-walk",
				description: "Guided excursion through the old city.",
				listingTypeSlug: "walking-tour",
				status: "draft",
				isActive: false,
				metadata: null,
				timezone: "Europe/Moscow",
				createdAt: "2026-03-11T00:00:00.000Z",
				updatedAt: "2026-03-11T00:00:00.000Z",
			},
		] satisfies ListingListItem[],
		page: { limit: 50, offset: 0, total: 2, hasMore: false },
	},
	invalidateQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		listing: {
			key: () => ["listing"],
			publish: {
				mutationOptions: () => ({
					mutationFn: async () => ({ ok: true }),
				}),
			},
			unpublish: {
				mutationOptions: () => ({
					mutationFn: async () => ({ ok: true }),
				}),
			},
		},
		organization: {
			key: () => ["organization"],
		},
	},
	queryClient: {
		invalidateQueries: mockState.invalidateQueries,
	},
}));

vi.mock("./query-state", () => ({
	createOrganizationListingsQueries: () => ({
		overlaySummaryQuery: {
			data: mockState.overlay,
			isPending: false,
			isError: false,
			error: null,
		},
		listingsQuery: {
			data: mockState.listings,
			isPending: false,
			isError: false,
			error: null,
		},
	}),
	createOrganizationListingsMutations: () => ({
		createManualOverride: {
			isPending: false,
			error: null,
			mutateAsync: vi.fn(),
		},
		resolveManualOverride: {
			isPending: false,
			error: null,
			mutateAsync: vi.fn(),
		},
		approveListing: {
			isPending: false,
			error: null,
			mutateAsync: vi.fn(),
		},
		clearListingApproval: {
			isPending: false,
			error: null,
			mutateAsync: vi.fn(),
		},
		publishListingToChannel: {
			isPending: false,
			error: null,
			mutateAsync: vi.fn(),
		},
		unpublishListing: {
			isPending: false,
			error: null,
			mutateAsync: vi.fn(),
		},
	}),
}));

import OrganizationListingsScreen from "./OrganizationListingsScreen.svelte";

test("renders the organization listings page with a loaded-state screenshot", async () => {
	renderWithQueryClient(OrganizationListingsScreen);

	await expect
		.element(page.getByRole("heading", { name: "Listings" }))
		.toBeVisible();
	await expect
		.element(page.getByText("/sea-explorer · boat-charter"))
		.toBeVisible();
	await expect
		.element(page.getByText("/historic-walk · walking-tour"))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot("organization-listings-screen");
});
