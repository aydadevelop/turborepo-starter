import { expect, type Page, test } from "@playwright/test";
import { signInAsSeedOwner } from "./utils/auth";
import { url } from "./utils/url";

const NO_LONGER_AVAILABLE_RE = /no longer available/i;
const SHIFT_REASON_TEXT = "Shift to later daytime slot";
const CANCELLED_BADGE_RE = /^cancelled$/i;

const signInAsShiftReviewer = async (page: Page) => {
	await signInAsSeedOwner(page);
};

test.describe("Shift Collision Flow", () => {
	test.describe.configure({ mode: "serial" });

	test("owner approval resolves to cancelled when proposed slot was blocked", async ({
		page,
	}) => {
		await signInAsShiftReviewer(page);
		await page.goto(url("/dashboard/bookings"));

		await expect(
			page.getByText("Shift Requests Review", { exact: true })
		).toBeVisible();

		const shiftListItem = page
			.locator("li")
			.filter({ hasText: SHIFT_REASON_TEXT })
			.first();

		await expect(shiftListItem).toBeVisible();
		await expect(
			shiftListItem.getByText("Manager: pending", { exact: false })
		).toBeVisible();

		await shiftListItem.getByRole("button", { name: "Review shift" }).click();
		await shiftListItem
			.getByRole("button", { name: "Approve shift", exact: true })
			.click();

		await expect(
			shiftListItem.locator("span").filter({ hasText: CANCELLED_BADGE_RE })
		).toBeVisible();
		await expect(shiftListItem.getByText(NO_LONGER_AVAILABLE_RE)).toBeVisible();
	});
});
