import { writable } from "svelte/store";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithQueryClient } from "../../test/browser/render";

const mockState = vi.hoisted(() => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateQueries: vi.fn(() => Promise.resolve()),
	mutateBooking: vi.fn(async () => ({
		id: "booking_test_1",
		totalPriceCents: 13_500,
		currency: "RUB",
	})),
	session: null as null | {
		session: { id: string };
		user: { id: string; email: string; name: string; isAnonymous: boolean };
	},
	slotAvailable: true as boolean,
	mutationError: null as Error | null,
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
		pricing: {
			getQuote: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["pricing", "getQuote", input],
					queryFn: async () => ({
						listingId: "listing_1",
						profileId: "profile_1",
						currency: "RUB",
						durationMinutes: 120,
						baseCents: 12_000,
						adjustmentCents: 1000,
						subtotalCents: 13_000,
						serviceFeeCents: 0,
						taxCents: 500,
						totalCents: 13_500,
						hasSpecialPricing: false,
						discountPreview: null,
					}),
				}),
			},
		},
		availability: {
			checkSlot: {
				queryOptions: ({ input }: { input: unknown }) => ({
					queryKey: ["availability", "checkSlot", input],
					queryFn: async () => ({ available: mockState.slotAvailable }),
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
						if (mockState.mutationError) {
							throw mockState.mutationError;
						}
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

import BookingRequestPanel from "./BookingRequestPanel.svelte";

test.beforeEach(() => {
	mockState.goto.mockClear();
	mockState.invalidateQueries.mockClear();
	mockState.mutateBooking.mockClear();
	mockState.session = null;
	mockState.slotAvailable = true;
	mockState.mutationError = null;
});

test("renders form fields and listing name", async () => {
	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await expect.element(page.getByText("Request this booking")).toBeVisible();
	await expect
		.element(page.getByText("Evening Charter", { exact: false }))
		.toBeVisible();
	await expect.element(page.getByLabelText("Start")).toBeVisible();
	await expect.element(page.getByLabelText("End")).toBeVisible();
	await expect.element(page.getByLabelText("Passengers")).toBeVisible();
	await expect.element(page.getByLabelText("Contact name")).toBeVisible();
	await expect.element(page.getByLabelText("Notes")).toBeVisible();
});

test("shows sign-in button and unauthenticated hint when not logged in", async () => {
	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await expect
		.element(page.getByRole("button", { name: "Sign in to request booking" }))
		.toBeVisible();
	await expect
		.element(page.getByText("Signing in is only required", { exact: false }))
		.toBeVisible();
});

test("shows validation hint when only one datetime field is filled", async () => {
	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Start"), "2030-01-15T09:00");

	await expect
		.element(
			page.getByText("Choose a valid time range before requesting a quote."),
		)
		.toBeVisible();
});

test("shows live booking preview with quote and available slot", async () => {
	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Start"), "2030-01-15T09:00");
	await userEvent.fill(page.getByLabelText("End"), "2030-01-15T11:00");

	await expect.element(page.getByText("Live booking preview")).toBeVisible();
	await expect
		.element(page.getByText("This slot is currently available."))
		.toBeVisible();
	await expect.element(page.getByText("Base")).toBeVisible();
	await expect.element(page.getByText("Total")).toBeVisible();
});

test("shows slot unavailable warning when slot is taken", async () => {
	mockState.slotAvailable = false;

	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Start"), "2030-01-15T09:00");
	await userEvent.fill(page.getByLabelText("End"), "2030-01-15T11:00");

	await expect
		.element(page.getByText("This slot is no longer available."))
		.toBeVisible();
});

test("redirects to login when unauthenticated user submits with a valid slot", async () => {
	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Start"), "2030-01-15T09:00");
	await userEvent.fill(page.getByLabelText("End"), "2030-01-15T11:00");

	await expect
		.element(page.getByText("This slot is currently available."))
		.toBeVisible();

	await userEvent.click(
		page.getByRole("button", { name: "Sign in to request booking" }),
	);

	expect(mockState.goto).toHaveBeenCalledWith(
		expect.stringContaining("/login?next="),
	);
});

test("shows booking submitted confirmation after authenticated user requests", async () => {
	mockState.session = {
		session: { id: "session_1" },
		user: {
			id: "user_1",
			email: "user@test.com",
			name: "Test User",
			isAnonymous: false,
		},
	};

	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Start"), "2030-01-15T09:00");
	await userEvent.fill(page.getByLabelText("End"), "2030-01-15T11:00");

	await expect.element(page.getByText("Total")).toBeVisible();
	await expect
		.element(page.getByText("This slot is currently available."))
		.toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Request booking" }));

	await expect
		.element(page.getByText("Booking request submitted"))
		.toBeVisible();
	await expect
		.element(page.getByText("booking_test_1", { exact: false }))
		.toBeVisible();
	expect(mockState.mutateBooking).toHaveBeenCalledOnce();
	expect(mockState.invalidateQueries).toHaveBeenCalledOnce();
});

test("shows error message when booking mutation fails", async () => {
	mockState.session = {
		session: { id: "session_1" },
		user: {
			id: "user_1",
			email: "user@test.com",
			name: "Test User",
			isAnonymous: false,
		},
	};
	mockState.mutationError = new Error("Something went wrong");

	renderWithQueryClient(BookingRequestPanel, {
		listingId: "listing_1",
		listingName: "Evening Charter",
	});

	await userEvent.fill(page.getByLabelText("Start"), "2030-01-15T09:00");
	await userEvent.fill(page.getByLabelText("End"), "2030-01-15T11:00");

	await expect
		.element(page.getByText("This slot is currently available."))
		.toBeVisible();

	await userEvent.click(page.getByRole("button", { name: "Request booking" }));

	await expect.element(page.getByText("Something went wrong")).toBeVisible();
});
