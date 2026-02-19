import { expect, test } from "@playwright/test";
import { url } from "./utils/url";

const HEADING_PATTERN = /Full Stack Cloudflare App/i;

test.describe("Landing Page", () => {
	test("loads home page", async ({ page }) => {
		await page.goto(url("/"));
		await expect(page).toHaveURL(url("/"));
	});

	test("displays main heading", async ({ page }) => {
		await page.goto(url("/"));
		await expect(
			page.getByRole("heading", { name: HEADING_PATTERN })
		).toBeVisible();
	});

	test("shows navigation links", async ({ page }) => {
		await page.goto(url("/"));
		await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Dashboard", exact: true })
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Bookings", exact: true })
		).toBeVisible();
	});

	test("displays feature cards", async ({ page }) => {
		await page.goto(url("/"));
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
		await page.goto(url("/"));
		const signInCard = page.locator('[data-slot="card"]').filter({
			hasText: "Authentication",
		});
		await signInCard.getByRole("link", { name: "Sign In" }).click();
		await expect(page).toHaveURL(url("/login"));
	});
});
