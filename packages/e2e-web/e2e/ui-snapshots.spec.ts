import { expect, test } from "@playwright/test";

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
		// Wait for any initial animations / hydration to settle
		await page.waitForLoadState("networkidle");
		await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
	});

	test("login page", async ({ page }) => {
		await page.goto("/login");
		await page.waitForLoadState("networkidle");
		await expect(page.getByTestId("login-heading")).toBeVisible();
		await expect(page.getByTestId("login-email-input")).toBeVisible();
	});
});
