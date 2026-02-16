import { expect, test } from "@playwright/test";
import { url } from "./helpers";

const BOATS_URL = url(
	"/boats?date=2026-03-16&startHour=10&durationHours=2&passengers=2"
);
const BOATS_FOUND_TEXT_RE = /boats found/i;
const AURORA_BOAT_URL_RE =
	/\/boats\/seed_boat_aurora--seed-aurora-8\?date=2026-03-16&durationHours=2&passengers=2$/;
const PRICING_BREAKDOWN_TEXT_RE = /Pricing Breakdown \(Estimate\)/i;
const GENERATED_SLOTS_TEXT_RE = /Generated slots:/i;

test.describe("User Flow", () => {
	test("public user can discover boats and open generated boat page", async ({
		page,
	}) => {
		await page.goto(BOATS_URL);

		await expect(
			page.getByRole("heading", { name: "Boat Pages", exact: true })
		).toBeVisible();
		await expect(page.getByText(BOATS_FOUND_TEXT_RE)).toBeVisible();

		const blockedBadge = page.getByText("Blocked", { exact: true }).first();
		const availableBadge = page.getByText("Available", { exact: true }).first();
		await expect(blockedBadge).toBeVisible();
		await expect(availableBadge).toBeVisible();

		const auroraCard = page.locator('[data-slot="card"]').filter({
			hasText: "Aurora 8",
		});
		await expect(auroraCard).toBeVisible();
		await auroraCard.getByRole("link", { name: "Open Boat Page" }).click();

		await expect(page).toHaveURL(AURORA_BOAT_URL_RE);
		await expect(
			page.getByRole("heading", { name: "Boat Page", exact: true })
		).toBeVisible();
		await expect(page.getByText(PRICING_BREAKDOWN_TEXT_RE)).toBeVisible();
		await expect(page.getByText(GENERATED_SLOTS_TEXT_RE)).toBeVisible();
		await expect(
			page.getByText("Sign in required", { exact: true })
		).toBeVisible();
		await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
	});
});
