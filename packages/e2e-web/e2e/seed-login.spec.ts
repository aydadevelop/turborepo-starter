import { expect, test } from "./fixtures";
import { url } from "./utils/url";

test.describe("Seeded Auth & Data", () => {
	test("seeded admin credentials can access seeded users", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/admin/users"));

		await expect(adminPage.getByTestId("admin-users-heading")).toBeVisible();
		await expect(
			adminPage.getByTestId("admin-user-row-seed_user_operator")
		).toBeVisible();
		await expect(
			adminPage.getByTestId("admin-user-row-seed_user_member")
		).toBeVisible();
	});

	test("seeded operator credentials can access dashboard settings", async ({
		operatorPage,
	}) => {
		await operatorPage.goto(url("/dashboard/settings"));

		await expect(
			operatorPage.getByTestId("account-settings-heading")
		).toBeVisible();
	});
});
