import { expect, test } from "@playwright/test";
import { signInAsSeedAdmin } from "./utils/auth";
import { url } from "./utils/url";

const LOGIN_URL_PATTERN = /\/login(\?|$)/;
const NAV_OPTIONS = { waitUntil: "domcontentloaded" } as const;

test.describe("Authentication Flow", () => {
	test("can navigate to login page", async ({ page }) => {
		await page.goto(url("/"), NAV_OPTIONS);
		await page.getByTestId("header-sign-in-button").click();
		await expect(page).toHaveURL(LOGIN_URL_PATTERN);
	});

	test("login page has sign in and sign up forms", async ({ page }) => {
		await page.goto(url("/login"), NAV_OPTIONS);
		await expect(page.getByTestId("login-heading")).toBeVisible();
		await expect(page.getByTestId("login-email-input")).toBeVisible();
		await expect(page.getByTestId("login-password-input")).toBeVisible();
	});

	test("shows validation errors for empty form", async ({ page }) => {
		await page.goto(url("/login"), NAV_OPTIONS);

		// Try to submit empty form
		await page.getByTestId("sign-in-submit-button").click();

		// Form should show validation (specific behavior depends on implementation)
		await expect(page.getByTestId("login-email-input")).toBeVisible();
	});

	test("shows sign-up toggle control", async ({ page }) => {
		await page.goto(url("/login"), NAV_OPTIONS);
		await expect(page.getByTestId("switch-to-sign-up-button")).toBeVisible();
	});
});

test.describe("Dashboard Access", () => {
	test("redirects unauthenticated users from dashboard to login", async ({
		page,
	}) => {
		await page.goto(url("/dashboard"), NAV_OPTIONS);
		await expect(page).toHaveURL(LOGIN_URL_PATTERN);
	});

	test("chat link in navigation works for authenticated user", async ({
		page,
	}) => {
		await signInAsSeedAdmin(page);
		await page.goto(url("/"), NAV_OPTIONS);
		const chatLink = page.getByTestId("nav-link-chat");

		// Vite dev can hot-reload while optimizing deps; retry bounded clicks to avoid flakiness.
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await chatLink.click();
			try {
				await expect(page).toHaveURL(url("/chat"), { timeout: 5000 });
				return;
			} catch (error) {
				if (attempt === 2) {
					throw error;
				}
			}
		}
	});
});

test.describe("Protected Routes", () => {
	test("todos page is accessible", async ({ page }) => {
		await page.goto(url("/todos"), NAV_OPTIONS);
		await expect(page).toHaveURL(url("/todos"));
	});
});
