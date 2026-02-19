import { expect, type Page, test } from "@playwright/test";
import { signInAsSeedOwner } from "./utils/auth";
import { url } from "./utils/url";

const PAYMENT_WIDGET_OR_MESSAGE_RE = /payment|cloudpayments|not configured/i;
const PAID_TEXT_RE = /paid/i;
const BOOKING_ID_PENDING = "seed_booking_odyssey_pending";
const BOOKING_ID_PAID = "seed_booking_aurora_confirmed";

const managedBookingItem = (page: Page, bookingId: string) =>
	page.getByTestId(`managed-booking-item-${bookingId}`);

test.describe("CloudPayments Payment", () => {
	test("Pay button appears for unpaid seeded booking and initiates payment attempt", async ({
		page,
	}) => {
		await signInAsSeedOwner(page);
		await page.goto(url("/dashboard/bookings"));

		const unpaidBookingItem = managedBookingItem(page, BOOKING_ID_PENDING);
		await expect(unpaidBookingItem).toBeVisible({ timeout: 10_000 });

		const payButton = unpaidBookingItem.getByTestId(
			"managed-booking-pay-button"
		);
		await expect(payButton).toBeVisible();

		await payButton.click();

		const paymentOutcome = page
			.getByTestId("managed-booking-action-message")
			.or(page.getByTestId("managed-booking-action-error"))
			.first();
		await expect(paymentOutcome).toBeVisible({ timeout: 10_000 });
		await expect(paymentOutcome).toContainText(PAYMENT_WIDGET_OR_MESSAGE_RE);
	});

	test("Pay button does not appear for paid seeded booking", async ({
		page,
	}) => {
		await signInAsSeedOwner(page);
		await page.goto(url("/dashboard/bookings"));

		const paidBookingItem = managedBookingItem(page, BOOKING_ID_PAID);
		await expect(paidBookingItem).toBeVisible({ timeout: 10_000 });
		await expect(
			paidBookingItem.getByTestId("managed-booking-payment-status")
		).toContainText(PAID_TEXT_RE);

		await expect(
			paidBookingItem.getByTestId("managed-booking-pay-button")
		).toBeHidden();
	});
});
