import { expect, test } from "@playwright/test";
import { signInAsSeedAdmin } from "./utils/auth";
import { url } from "./utils/url";

const DASHBOARD_URL_RE = /\/dashboard/;
const ADMIN_USERS_URL_RE = /\/admin\/users/;

test.describe("Impersonation & Org Switching", () => {
	test("seeded admin can impersonate seeded operator", async ({ page }) => {
		await signInAsSeedAdmin(page);

		await page.goto(url("/admin/users"));
		await expect(page.getByTestId("admin-users-heading")).toBeVisible();

		await page.getByTestId("impersonate-user-seed_user_operator").click();

		await expect(page).toHaveURL(DASHBOARD_URL_RE);
		await expect(page.getByTestId("impersonation-banner")).toBeVisible();
		await expect(page.getByTestId("impersonated-user-name")).toBeVisible();

		const orgTrigger = page.getByTestId("org-switcher-trigger").first();
		if ((await orgTrigger.count()) > 0) {
			await expect(orgTrigger).toBeVisible({ timeout: 5000 });
		}

		await page.getByTestId("stop-impersonating-button").click();

		await expect(page).toHaveURL(ADMIN_USERS_URL_RE, { timeout: 5000 });
		await expect(page.getByTestId("impersonation-banner")).not.toBeVisible();
	});
});
