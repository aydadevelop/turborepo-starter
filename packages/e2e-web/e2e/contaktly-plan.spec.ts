import { expect, test } from "./fixtures";
import { url } from "./utils/url";

test.describe("Contaktly Admin Plan", () => {
	test("admin sees the stage matrix and calendar split", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly"));

		await expect(
			adminPage.getByTestId("contaktly-overview-heading")
		).toBeVisible();
		await expect(adminPage.getByTestId("contaktly-stage-matrix")).toBeVisible();
		await expect(adminPage.getByTestId("contaktly-calendar-poc")).toContainText(
			"client pastes a booking URL"
		);
		await expect(adminPage.getByTestId("contaktly-calendar-mvp")).toContainText(
			"Google OAuth"
		);
		await expect(
			adminPage.getByTestId("contaktly-slice-google-oauth-calendar-access")
		).toBeVisible();
	});

	test("admin sees the generated widget snippet and config id", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/widget"));

		await expect(adminPage.getByTestId("contaktly-widget-heading")).toBeVisible();
		await expect(
			adminPage.getByTestId("contaktly-widget-config-id")
		).toContainText("ctly-demo-founder");
		await expect(adminPage.getByTestId("contaktly-widget-snippet")).toContainText(
			"data-params=\"ctly-demo-founder\""
		);
		await expect(adminPage.getByTestId("contaktly-widget-snippet")).toContainText(
			"/loader.js"
		);
	});
});
