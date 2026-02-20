import { expect, test } from "@playwright/test";
import { url } from "./utils/url";

const HEADING_PATTERN = /Cloudflare SaaS Starter/i;

test.describe("Landing Page", () => {
	test("loads home page and shows hero heading", async ({ page }) => {
		await page.goto(url("/"));
		await expect(page).toHaveURL(url("/"));
		await expect(
			page.getByRole("heading", { name: HEADING_PATTERN })
		).toBeVisible();
	});

	test("sign in button navigates to login", async ({ page }) => {
		await page.goto(url("/"));
		const signInCard = page.locator('[data-slot="card"]').filter({
			hasText: "Authentication",
		});
		await signInCard.getByRole("link", { name: "Sign In" }).click();
		await expect(page).toHaveURL(url("/login"));
	});
});
