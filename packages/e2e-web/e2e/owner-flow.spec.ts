import { expect, test } from "@playwright/test";
import { signInAsSeedOwner } from "./auth-helpers";
import { url } from "./helpers";
import { SEED_CREDENTIALS } from "./seed-fixtures";

const DASHBOARD_URL_RE = /\/dashboard/;
const BOOKING_ID_PENDING = "seed_booking_odyssey_pending";

test.describe("Owner Flow", () => {
	test("seeded owner can access owner capability", async ({ page }) => {
		await signInAsSeedOwner(page);

		await page.goto(url("/dashboard"));

		await expect(page).toHaveURL(DASHBOARD_URL_RE);
		await expect(
			page.getByRole("heading", { name: "Dashboard", exact: true })
		).toBeVisible();

		await page.goto(url("/dashboard/bookings"));
		await expect(
			page.getByTestId(`managed-booking-item-${BOOKING_ID_PENDING}`)
		).toBeVisible({ timeout: 10_000 });

		await page.goto(
			url(
				"/boats/seed_boat_aurora--seed-aurora-8?date=2026-03-16&durationHours=2&passengers=2"
			)
		);
		await expect(
			page.getByTestId("booking-access-status")
		).toContainText(SEED_CREDENTIALS.owner.email);
	});
});
