import { expect, test } from "@playwright/test";
import { goto } from "./utils/setup";

test.describe("Public Layout", () => {
	test("public routes render header shell", async ({ page }) => {
		await goto(page, "/");
		await expect(page.getByTestId("landing-hero-title")).toBeVisible();
		await expect(page.getByTestId("app-shell-header")).toBeVisible();

		await goto(page, "/login");
		await expect(page.getByTestId("login-heading")).toBeVisible();
		await expect(page.getByTestId("app-shell-header")).toBeVisible();
	});
});
