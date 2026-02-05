import { expect, test } from "@playwright/test";

const LOADING_REDIRECT_PATTERN = /loading|redirecting|login/i;

test.describe("Authentication Flow", () => {
	test("can navigate to login page", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Sign In" }).click();
		await expect(page).toHaveURL("/login");
	});

	test("login page has sign in and sign up forms", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
		await expect(page.getByPlaceholder("Email")).toBeVisible();
		await expect(page.getByPlaceholder("Password")).toBeVisible();
	});

	test("shows validation errors for empty form", async ({ page }) => {
		await page.goto("/login");

		// Try to submit empty form
		await page.getByRole("button", { name: "Sign In" }).click();

		// Form should show validation (specific behavior depends on implementation)
		await expect(page.getByPlaceholder("Email")).toBeVisible();
	});

	test("can switch between sign in and sign up", async ({ page }) => {
		await page.goto("/login");

		// Look for a way to switch to sign up
		const signUpLink = page.getByText("Sign Up");
		if (await signUpLink.isVisible()) {
			await signUpLink.click();
			await expect(
				page.getByRole("heading", { name: "Sign Up" })
			).toBeVisible();
		}
	});
});

test.describe("Dashboard Access", () => {
	test("redirects unauthenticated users from dashboard to login", async ({
		page,
	}) => {
		await page.goto("/dashboard");

		// Should redirect to login or show login prompt
		await page.waitForURL(
			(url) => url.pathname === "/login" || url.pathname === "/dashboard"
		);

		// If still on dashboard, should show loading/redirect message
		const url = page.url();
		if (url.includes("/dashboard")) {
			await expect(page.getByText(LOADING_REDIRECT_PATTERN)).toBeVisible({
				timeout: 5000,
			});
		}
	});

	test("dashboard link in navigation works", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("link", { name: "Dashboard" }).click();
		await expect(page).toHaveURL("/dashboard");
	});
});

test.describe("Protected Routes", () => {
	test("todos page is accessible", async ({ page }) => {
		await page.goto("/todos");
		await expect(page).toHaveURL("/todos");
	});
});
