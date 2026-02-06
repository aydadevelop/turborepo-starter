import { expect, test } from "@playwright/test";

const HEADING_PATTERN = /Full Stack Cloudflare App/i;

test.describe("Landing Page", () => {
	test("loads home page", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL("/");
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
		await expect(
			page.getByRole("link", { name: "Dashboard", exact: true })
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Todos", exact: true })
		).toBeVisible();
	});

	test("displays feature cards", async ({ page }) => {
		await page.goto("/");
		const main = page.getByRole("main");
		await expect(
			main.getByText("Authentication", { exact: true })
		).toBeVisible();
		await expect(main.getByText("Dashboard", { exact: true })).toBeVisible();
		await expect(main.getByText("Todos (oRPC)", { exact: true })).toBeVisible();
		await expect(
			main.getByText("UI Components", { exact: true })
		).toBeVisible();
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
