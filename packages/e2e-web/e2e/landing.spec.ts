import { expect, test } from "@playwright/test";
import { url } from "./utils/url";

test.describe("Landing Page", () => {
	test("loads home page and shows hero heading", async ({ page }) => {
		await page.goto(url("/"));
		await expect(page).toHaveURL(url("/"));
		await expect(page.getByTestId("landing-hero-title")).toBeVisible();
	});

	test("sign in button navigates to login", async ({ page }) => {
		await page.goto(url("/"));
		await page.getByTestId("landing-auth-signin").click();
		await expect(page).toHaveURL(url("/login"));
	});
});
