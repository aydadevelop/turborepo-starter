import { expect, test } from "./fixtures";
import { createOrgAccountScenario } from "./setup/org-account";
import { signInWithEmail } from "./utils/auth";
import { url } from "./utils/url";

test.describe("Org Account Setup Helpers", () => {
	test("can provision an isolated org account scenario without relying on the baseline seed", async ({
		page,
		testData,
	}) => {
		const scenario = await createOrgAccountScenario(testData, {
			orgName: "Scenario Org",
		});

		await signInWithEmail(page, {
			email: scenario.user.email,
			password: scenario.user.password,
		});

		await page.goto(url("/org/team"));

		await expect(page.getByTestId("org-heading")).toBeVisible();
		await expect(page.getByTestId("org-team-members-title")).toContainText(
			"Members (1)"
		);
		await expect(
			page.locator(`[data-testid="org-member-email-${scenario.user.id}"]`)
		).toContainText(scenario.user.email);
	});
});
