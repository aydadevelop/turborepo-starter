import { expect, test } from "./fixtures";
import { url } from "./utils/url";

test.describe("Contaktly Widget Config", () => {
	test("admin updates the booking URL and sees it persisted after reload", async ({
		adminPage,
	}) => {
		await adminPage.goto(url("/dashboard/contaktly/widget"));

		const bookingUrlInput = adminPage.getByTestId(
			"contaktly-booking-url-input"
		);
		await expect(bookingUrlInput).toHaveValue(
			"https://calendly.com/demo-team/intro"
		);

		await bookingUrlInput.fill("https://calendly.com/demo-team/follow-up");
		await adminPage.getByRole("button", { name: "Save booking URL" }).click();

		await expect(
			adminPage.getByTestId("contaktly-booking-url-status")
		).toContainText("Saved");

		await adminPage.reload();

		await expect(bookingUrlInput).toHaveValue(
			"https://calendly.com/demo-team/follow-up"
		);
	});
});
