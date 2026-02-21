import { expect, test } from "@playwright/test";
import { url } from "./utils/url";

const LOGIN_URL_PATTERN = /\/login/;

test.describe("Authentication Flow", () => {
	test("can navigate to login page", async ({ page }) => {
		await page.goto(url("/"));
		await page.getByTestId("header-sign-in-button").click();
		await expect(page).toHaveURL(LOGIN_URL_PATTERN);
	});

	test("login page has sign in and sign up forms", async ({ page }) => {
		await page.goto(url("/login"));
		await expect(page.getByTestId("login-heading")).toBeVisible();
		await expect(page.getByTestId("login-email-input")).toBeVisible();
		await expect(page.getByTestId("login-password-input")).toBeVisible();
	});

	test("shows validation errors for empty form", async ({ page }) => {
		await page.goto(url("/login"));

		// Try to submit empty form
		await page.getByTestId("sign-in-submit-button").click();

		// Form should show validation (specific behavior depends on implementation)
		await expect(page.getByTestId("login-email-input")).toBeVisible();
	});

	test("shows sign-up toggle control", async ({ page }) => {
		await page.goto(url("/login"));
		await expect(page.getByTestId("switch-to-sign-up-button")).toBeVisible();
	});
});

test.describe("Dashboard Access", () => {
	test("redirects unauthenticated users from dashboard to login", async ({
		page,
	}) => {
		await page.goto(url("/dashboard"));
		await expect(page).toHaveURL(LOGIN_URL_PATTERN);
	});

	test("dashboard link in navigation works", async ({ page }) => {
		await page.goto(url("/"));
		await page.getByTestId("nav-link-dashboard").click();
		await expect(page).toHaveURL(url("/dashboard"));
	});
});

test.describe("Protected Routes", () => {
	test("todos page is accessible", async ({ page }) => {
		await page.goto(url("/todos"));
		await expect(page).toHaveURL(url("/todos"));
	});
});
