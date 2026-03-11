import { E2E_BASELINE } from "@my-app/db/e2e/baseline";
import { expect, test } from "./fixtures";
import { url } from "./utils/url";

const DASHBOARD_URL_RE = /\/dashboard/;
const ADMIN_USERS_URL_RE = /\/admin\/users/;

test.describe("Impersonation & Org Switching", () => {
	test("baseline admin can impersonate baseline operator", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/admin/users"));
		await expect(adminPage.getByTestId("admin-users-heading")).toBeVisible();

		await adminPage
			.getByTestId(`impersonate-user-${E2E_BASELINE.ids.operatorUserId}`)
			.click();

		await expect(adminPage).toHaveURL(DASHBOARD_URL_RE);
		await expect(adminPage.getByTestId("impersonation-banner")).toBeVisible();
		await expect(adminPage.getByTestId("impersonated-user-name")).toBeVisible();

		const orgTrigger = adminPage.getByTestId("org-switcher-trigger").first();
		if ((await orgTrigger.count()) > 0) {
			await expect(orgTrigger).toBeVisible({ timeout: 5000 });
		}

		await adminPage.getByTestId("stop-impersonating-button").click();

		await expect(adminPage).toHaveURL(ADMIN_USERS_URL_RE, { timeout: 5000 });
		await expect(
			adminPage.getByTestId("impersonation-banner")
		).not.toBeVisible();
	});
});
