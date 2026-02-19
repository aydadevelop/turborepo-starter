import { expect, test } from "@playwright/test";
import { signInAsSeedAdmin } from "./utils/auth";
import { url } from "./utils/url";

const DASHBOARD_URL_RE = /\/dashboard/;
const ADMIN_USERS_URL_RE = /\/admin\/users/;
const IMPERSONATING_RE = /You are impersonating/i;
const ORG_SWITCHER_BUTTON_RE = /Seed (Demo Marina|Customer Club)/;

test.describe("Impersonation & Org Switching", () => {
	test("seeded admin can impersonate seeded customer and switch orgs", async ({
		page,
	}) => {
		await signInAsSeedAdmin(page);

		await page.goto(url("/admin/users"));
		await expect(
			page.getByRole("heading", { name: "Users", exact: true })
		).toBeVisible();

		const targetRow = page
			.locator("table tbody tr")
			.filter({ hasText: "customer+seed@boat.local" });
		await expect(targetRow).toBeVisible();
		await targetRow.getByRole("button", { name: "Impersonate" }).click();

		await expect(page).toHaveURL(DASHBOARD_URL_RE);
		await expect(page.getByText(IMPERSONATING_RE)).toBeVisible();
		await expect(
			page.locator("strong").filter({ hasText: "Ivan Petrov" })
		).toBeVisible();

		const orgTrigger = page
			.getByRole("button", { name: ORG_SWITCHER_BUTTON_RE })
			.first();
		await expect(orgTrigger).toBeVisible({ timeout: 5000 });

		await orgTrigger.click();
		const customerClubOption = page.getByText("Seed Customer Club", {
			exact: true,
		});
		await expect(customerClubOption).toBeVisible();
		await customerClubOption.click();
		await expect(orgTrigger).toContainText("Seed Customer Club", {
			timeout: 5000,
		});

		await page.getByRole("button", { name: "Stop impersonating" }).click();

		await expect(page).toHaveURL(ADMIN_USERS_URL_RE, { timeout: 5000 });
		await expect(page.getByText(IMPERSONATING_RE)).not.toBeVisible();
	});
});
