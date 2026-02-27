import { expect, test } from "@playwright/test";
import { signInAsSeedAdmin, signInAsSeedOperator } from "./utils/auth";
import { url } from "./utils/url";

test.describe("Seeded Auth & Data", () => {
	test("seeded admin credentials can access seeded users", async ({ page }) => {
		await signInAsSeedAdmin(page);
		await page.goto(url("/admin/users"));

		await expect(page.getByTestId("admin-users-heading")).toBeVisible();
		await expect(
			page.getByTestId("admin-user-row-seed_user_operator")
		).toBeVisible();
		await expect(
			page.getByTestId("admin-user-row-seed_user_member")
		).toBeVisible();
	});

	test("seeded operator credentials can access dashboard settings", async ({
		page,
	}) => {
		await signInAsSeedOperator(page);
		await page.goto(url("/dashboard/settings"));

		await expect(
			page.getByRole("heading", { name: "Account Settings" })
		).toBeVisible();
	});
});
