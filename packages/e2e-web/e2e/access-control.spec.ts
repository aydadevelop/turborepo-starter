import { expect, test } from "./fixtures";
import { rpcRequest } from "./utils/auth";
import { url } from "./utils/url";

const DASHBOARD_SETTINGS_URL_RE = /\/dashboard\/settings/;

test.describe("Access Control", () => {
	test("non-admin users are redirected away from /admin/users", async ({
		operatorPage,
	}) => {
		await operatorPage.goto(url("/admin/users"));

		await expect(operatorPage).toHaveURL(DASHBOARD_SETTINGS_URL_RE);
		await expect(
			operatorPage.getByTestId("account-settings-heading")
		).toBeVisible();
	});

	test("non-admin users cannot call admin RPC endpoints", async ({
		operatorPage,
	}) => {
		const result = await rpcRequest(operatorPage, {
			path: "admin/organizations/listUsers",
			input: { limit: 5 },
		});

		expect(result.status).toBe(403);
	});
});
