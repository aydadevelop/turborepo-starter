import { expect, test } from "@playwright/test";
import { rpcRequest, signInAsSeedOperator } from "./utils/auth";
import { url } from "./utils/url";

const DASHBOARD_SETTINGS_URL_RE = /\/dashboard\/settings/;

test.describe("Access Control", () => {
	test("non-admin users are redirected away from /admin/users", async ({
		page,
	}) => {
		await signInAsSeedOperator(page);
		await page.goto(url("/admin/users"));

		await expect(page).toHaveURL(DASHBOARD_SETTINGS_URL_RE);
		await expect(
			page.getByRole("heading", { name: "Account Settings" })
		).toBeVisible();
	});

	test("non-admin users cannot call admin RPC endpoints", async ({ page }) => {
		await signInAsSeedOperator(page);

		const result = await rpcRequest(page, {
			path: "admin/organizations/listUsers",
			input: { limit: 5 },
		});

		expect(result.status).toBe(403);
	});
});
