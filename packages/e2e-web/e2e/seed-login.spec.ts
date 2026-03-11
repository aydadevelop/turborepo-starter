import { E2E_BASELINE } from "@my-app/db/e2e/baseline";
import { expect, test } from "./fixtures";
import { url } from "./utils/url";

test.describe("E2E Baseline Auth & Data", () => {
	test("baseline admin credentials can access baseline users", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/admin/users"));

		await expect(adminPage.getByTestId("admin-users-heading")).toBeVisible();
		await expect(
			adminPage.getByTestId(`admin-user-row-${E2E_BASELINE.ids.operatorUserId}`)
		).toBeVisible();
		await expect(
			adminPage.getByTestId(`admin-user-row-${E2E_BASELINE.ids.memberUserId}`)
		).toBeVisible();
	});

	test("baseline operator credentials can access dashboard settings", async ({
		operatorPage,
	}) => {
		await operatorPage.goto(url("/dashboard/settings"));

		await expect(
			operatorPage.getByTestId("account-settings-heading")
		).toBeVisible();
	});
});
