import { expect, test } from "@playwright/test";
import { signInAsSeedAdmin } from "./utils/auth";
import { url } from "./utils/url";

const DASHBOARD_URL_RE = /\/dashboard/;
const ADMIN_USERS_URL_RE = /\/admin\/users/;
const IMPERSONATING_RE = /You are impersonating/i;
const ORG_SWITCHER_BUTTON_RE = /Starter Organization/;

test.describe("Impersonation & Org Switching", () => {
	test("seeded admin can impersonate seeded operator and switch orgs", async ({
		page,
	}) => {
		await signInAsSeedAdmin(page);

		await page.goto(url("/admin/users"));
		await expect(
			page.getByRole("heading", { name: "Users", exact: true })
		).toBeVisible();

		const targetRow = page
			.locator("table tbody tr")
			.filter({ hasText: "operator@example.com" });
		await expect(targetRow).toBeVisible();
		await targetRow.getByRole("button", { name: "Impersonate" }).click();

		await expect(page).toHaveURL(DASHBOARD_URL_RE);
		await expect(page.getByText(IMPERSONATING_RE)).toBeVisible();
		await expect(
			page.locator("strong").filter({ hasText: "Operations User" })
		).toBeVisible();

		const orgTrigger = page
			.getByRole("button", { name: ORG_SWITCHER_BUTTON_RE })
			.first();
		await expect(orgTrigger).toBeVisible({ timeout: 5000 });

		await page.getByRole("button", { name: "Stop impersonating" }).click();

		await expect(page).toHaveURL(ADMIN_USERS_URL_RE, { timeout: 5000 });
		await expect(page.getByText(IMPERSONATING_RE)).not.toBeVisible();
	});
});
