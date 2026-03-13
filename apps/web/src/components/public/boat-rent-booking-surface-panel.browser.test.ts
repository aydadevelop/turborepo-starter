import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { writable } from "svelte/store";
import type { StorefrontBookingSurface } from "$lib/orpc-types";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateQueries: vi.fn(() => Promise.resolve()),
	mutateBooking: vi.fn(async () => ({
		id: "booking_1",
		totalPriceCents: 13_500,
		currency: "RUB",
	})),
	session: null,
	surface: {
		listingId: "listing_1",
		serviceFamily: "boat_rent",
		timezone: "Europe/Moscow",
		date: "2030-01-15",
		requestedDurationMinutes: 120,
		passengers: 4,
		minimumDurationMinutes: 120,
		minimumNoticeMinutes: 60,
		durationOptionsMinutes: [120, 180, 240],
		slotStepMinutes: 30,
		requestedDiscountCode: "SPRING10",
		pricingConfigured: true,
		currency: "RUB",
		summary: {
			totalSlotCount: 3,
			availableSlotCount: 1,
			blockedSlotCount: 1,
			noticeTooShortSlotCount: 0,
			minimumDurationSlotCount: 0,
			specialPricedSlotCount: 1,
		},
		slots: [
			{
				startsAt: "2030-01-15T09:00:00.000Z",
				endsAt: "2030-01-15T11:00:00.000Z",
				startsAtLabel: "12:00",
				endsAtLabel: "14:00",
				status: "available",
				statusLabel: "Available",
				blockReason: null,
				blockSource: null,
				minimumDurationMinutes: 120,
				quote: {
					listingId: "listing_1",
					profileId: "profile_1",
					currency: "RUB",
					durationMinutes: 120,
					baseCents: 12_000,
					adjustmentCents: 1_000,
					subtotalCents: 13_000,
					serviceFeeCents: 0,
					taxCents: 500,
					totalCents: 13_500,
					hasSpecialPricing: true,
					discountPreview: {
						code: "SPRING10",
						status: "applied",
						reasonCode: null,
						reasonLabel: null,
						appliedAmountCents: 1_000,
						discountedSubtotalCents: 12_000,
						discountedServiceFeeCents: 0,
						discountedTaxCents: 500,
						discountedTotalCents: 12_500,
					},
				},
			},
			{
				startsAt: "2030-01-15T11:00:00.000Z",
				endsAt: "2030-01-15T13:00:00.000Z",
				startsAtLabel: "14:00",
				endsAtLabel: "16:00",
				status: "blocked",
				statusLabel: "Blocked",
				blockReason: "Maintenance window",
				blockSource: "manual",
				minimumDurationMinutes: 120,
				quote: null,
			},
			{
				startsAt: "2030-01-15T13:00:00.000Z",
				endsAt: "2030-01-15T15:00:00.000Z",
				startsAtLabel: "16:00",
				endsAtLabel: "18:00",
				status: "notice_too_short",
				statusLabel: "Notice too short",
				blockReason: null,
				blockSource: null,
				minimumDurationMinutes: 120,
				quote: null,
			},
		],
	} satisfies StorefrontBookingSurface,
}));

vi.mock("$app/navigation", () => ({
	goto: mockState.goto,
}));

vi.mock("$app/paths", () => ({
	resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
	page: {
		url: new URL("http://localhost/listings/listing_1"),
	},
}));

vi.mock("$lib/auth-client", () => ({
	authClient: {
		useSession: () =>
			writable({
				data: mockState.session,
				error: null,
				isPending: false,
			}),
	},
}));

vi.mock("$lib/orpc", () => ({
	orpc: {
		storefront: {
			getBookingSurface: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["storefront", "booking-surface", input],
					queryFn: async () => mockState.surface,
				}),
			},
		},
		booking: {
			create: {
				mutationOptions: (options?: {
					onSuccess?: (booking: {
						id: string;
						totalPriceCents: number;
						currency: string;
					}) => Promise<void> | void;
				}) => ({
					mutationKey: ["booking", "create"],
					mutationFn: async () => {
						const result = await mockState.mutateBooking();
						await options?.onSuccess?.(result);
						return result;
					},
				}),
			},
			key: () => ["booking"],
		},
	},
	queryClient: {
		invalidateQueries: mockState.invalidateQueries,
	},
}));

import BoatRentBookingSurfacePanel from "./BoatRentBookingSurfacePanel.svelte";

test.beforeEach(() => {
	mockState.goto.mockClear();
	mockState.invalidateQueries.mockClear();
	mockState.mutateBooking.mockClear();
	mockState.session = null;
});

test("renders the composed boat-rent booking surface with slot, pricing, and discount state", async () => {
	renderWithQueryClient(BoatRentBookingSurfacePanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Date"), "2030-01-15");

	await expect
		.element(page.getByText("Live booking surface"))
		.toBeVisible();
	await expect.element(page.getByText("1 available")).toBeVisible();
	await expect.element(page.getByText("1 blocked")).toBeVisible();
	await expect.element(page.getByText("12:00 → 14:00")).toBeVisible();
	await expect
		.element(page.getByText("Special pricing rules apply to this slot."))
		.toBeVisible();
	await expect.element(page.getByText("Maintenance window")).toBeVisible();
	await expect
		.element(page.getByText("Code SPRING10 applied to the selected slot."))
		.toBeVisible();
	await expect.element(page.getByText("Discount (SPRING10)")).toBeVisible();
	await expect.element(page.getByText(/125\.00/).first()).toBeVisible();
	await expect
		.element(page.getByRole("button", { name: "Sign in to request booking" }))
		.toBeVisible();
	await expect(document.body).toMatchScreenshot(
		"boat-rent-booking-surface-panel"
	);
});
