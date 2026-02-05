import { expect, test } from "@playwright/test";

const TITLE_PATTERN = /Cloudflare App/;
const HEADING_PATTERN = /Full Stack Cloudflare App/i;

test.describe("Landing Page", () => {
	test("has correct title", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(TITLE_PATTERN);
	});

	test("displays main heading", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: HEADING_PATTERN })
		).toBeVisible();
	});

	test("shows navigation links", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Todos" })).toBeVisible();
	});

	test("displays feature cards", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("Authentication")).toBeVisible();
		await expect(page.getByText("Dashboard")).toBeVisible();
		await expect(page.getByText("Todos (oRPC)")).toBeVisible();
		await expect(page.getByText("UI Components")).toBeVisible();
	});

	test("sign in button navigates to login", async ({ page }) => {
		await page.goto("/");
		const signInCard = page.locator('[data-slot="card"]').filter({
			hasText: "Authentication",
		});
		await signInCard.getByRole("link", { name: "Sign In" }).click();
		await expect(page).toHaveURL("/login");
	});
});
