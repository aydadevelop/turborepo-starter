import { expect, test } from "./fixtures";
import { url } from "./utils/url";

const LOGIN_URL_RE = /\/login(\?|$)/;
const NAV_OPTIONS = { waitUntil: "domcontentloaded" } as const;

test.describe("Dashboard Bookings", () => {
	test("loads the bookings page for an authenticated user", async ({
		operatorPage,
	}) => {
		await operatorPage.goto(url("/dashboard/bookings"), NAV_OPTIONS);

		await expect(
			operatorPage.getByRole("heading", { name: "My Bookings" })
		).toBeVisible();
	});

	test("shows the bookings table with empty state when user has no bookings", async ({
		operatorPage,
	}) => {
		await operatorPage.goto(url("/dashboard/bookings"), NAV_OPTIONS);

		await expect(operatorPage.getByText("Booking history")).toBeVisible();
		// The baseline operator has no bookings — the table renders with an empty state.
		await expect(
			operatorPage.getByText("You have no bookings yet.")
		).toBeVisible();
	});

	test("redirects unauthenticated users to login", async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto(url("/dashboard/bookings"), NAV_OPTIONS);

		await expect(page).toHaveURL(LOGIN_URL_RE);
		await context.close();
	});

	test("dashboard bookings page is accessible from the admin account", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/bookings"), NAV_OPTIONS);

		await expect(
			adminPage.getByRole("heading", { name: "My Bookings" })
		).toBeVisible();
		await expect(adminPage.getByText("Booking history")).toBeVisible();
	});
});
