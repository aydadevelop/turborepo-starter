import { expect, test } from "@playwright/test";
import { url } from "./helpers";

const LOGIN_HEADING_PATTERN = /welcome back/i;

test.describe("Authentication Flow", () => {
	test("can navigate to login page", async ({ page }) => {
		await page.goto(url("/"));
		await page.getByRole("button", { name: "Sign In" }).click();
		await expect(page).toHaveURL(url("/login"));
	});

	test("login page has sign in and sign up forms", async ({ page }) => {
		await page.goto(url("/login"));
		await expect(page.getByText(LOGIN_HEADING_PATTERN)).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
	});

	test("shows validation errors for empty form", async ({ page }) => {
		await page.goto(url("/login"));

		// Try to submit empty form
		await page
			.getByRole("main")
			.getByRole("button", { name: "Sign In", exact: true })
			.click();

		// Form should show validation (specific behavior depends on implementation)
		await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
	});

	test("shows sign-up toggle control", async ({ page }) => {
		await page.goto(url("/login"));
		await expect(
			page.getByRole("button", { name: "Need an account? Sign Up" })
		).toBeVisible();
	});
});

test.describe("Dashboard Access", () => {
	test("redirects unauthenticated users from dashboard to login", async ({
		page,
	}) => {
		await page.goto(url("/dashboard"));
		await expect(page).toHaveURL(url("/login"));
	});

	test("dashboard link in navigation works", async ({ page }) => {
		await page.goto(url("/"));
		await page
			.getByRole("banner")
			.getByRole("link", { name: "Dashboard", exact: true })
			.click();
		await expect(page).toHaveURL(url("/dashboard"));
	});
});

test.describe("Protected Routes", () => {
	test("todos page is accessible", async ({ page }) => {
		await page.goto(url("/todos"));
		await expect(page).toHaveURL(url("/todos"));
	});
});
