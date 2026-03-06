import { expect, test } from "./fixtures";
import { url } from "./utils/url";

test.describe("Contaktly Google Calendar", () => {
	test("workspace admin connects a linked Google account to the widget config", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/widget"));

		await expect(
			adminPage.getByTestId("contaktly-google-calendar-status")
		).toContainText("Linked Google account ready");
		await expect(
			adminPage.getByTestId("contaktly-google-calendar-scopes")
		).toContainText("calendar.events");

		await adminPage
			.getByRole("button", { name: "Connect Google Calendar" })
			.click();

		await expect(
			adminPage.getByTestId("contaktly-google-calendar-status")
		).toContainText("Connected");
		await expect(
			adminPage.getByTestId("contaktly-google-calendar-email")
		).toContainText("admin@admin.com");
		await expect(
			adminPage.getByTestId("contaktly-google-calendar-calendar-id")
		).toContainText("primary");

		await adminPage.reload();

		await expect(
			adminPage.getByTestId("contaktly-google-calendar-status")
		).toContainText("Connected");
	});
});
