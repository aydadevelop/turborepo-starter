import { expect, test } from "@playwright/test";

const settleVisualState = async (
	page: import("@playwright/test").Page,
): Promise<void> => {
	await page.waitForLoadState("networkidle");
	await page.evaluate(async () => {
		if ("fonts" in document) {
			await document.fonts.ready;
		}
	});
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(150);
};

/**
 * Visual UI snapshot tests for public pages.
 * These run automatically after every agent turn via the Copilot agentStop hook.
 * On first run they create baseline .png snapshots; subsequent runs compare.
 *
 * To update baselines after an intentional UI change:
 *   cd packages/e2e-web && bunx playwright test ui-snapshots --update-snapshots --config playwright.snapshots.config.ts
 */

test.describe("UI snapshots — public pages", () => {
	test("landing page", async ({ page }) => {
		await page.goto("/");
		await settleVisualState(page);
		await expect(page).toHaveScreenshot("landing.png", {
			fullPage: true,
			animations: "disabled",
			caret: "hide",
		});
	});

	test("login page", async ({ page }) => {
		await page.goto("/login");
		await settleVisualState(page);
		await expect(page.getByTestId("login-heading")).toBeVisible();
		await expect(page.getByTestId("login-email-input")).toBeVisible();
	});
});
