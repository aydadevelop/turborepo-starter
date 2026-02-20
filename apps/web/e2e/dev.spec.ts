import { expect, type Page, test } from "@playwright/test";
import { goto } from "./utils/setup";

const readNumberByTestId = async (page: Page, id: string) => {
	const raw = await page.getByTestId(id).first().textContent();
	return Number((raw ?? "0").replace(/[^\d.-]/g, ""));
};

test.describe("Frontend Dev Interactions", () => {
	test.describe.configure({ mode: "serial" });

	test("diagnostic home supports fast state setup and screenshot capture", async ({
		page,
	}) => {
		await goto(page, "/diagnostic", {
			viewport: { width: 1366, height: 900 },
			localStorage: {
				"frontend-dev:last-scenario": "diagnostic-home",
			},
			sessionStorage: {
				"frontend-dev:flow": "quick-visual-check",
			},
			waitMs: 120,
		});

		await expect(
			page.getByTestId("diagnostic-card-reactive-chain")
		).toBeVisible();
		await expect(
			page.getByTestId("diagnostic-card-derived-stability")
		).toBeVisible();

		await page.screenshot({
			path: "test-results/diagnostic-home.png",
			fullPage: true,
		});
	});

	test("reactive chain supports interaction replay and screenshot capture", async ({
		page,
	}) => {
		await goto(page, "/diagnostic/reactive-chain", {
			query: {
				date: "2026-03-20",
				startHour: 10,
				durationHours: 2,
				passengers: 2,
			},
			viewport: { width: 1366, height: 900 },
			localStorage: {
				"frontend-dev:last-scenario": "reactive-chain",
			},
			waitMs: 300,
		});

		await expect(page.getByTestId("reactive-nav-start-hour-inc")).toBeVisible();

		const parsedBefore = await readNumberByTestId(
			page,
			"reactive-counter-parsed-search"
		);

		await page.getByTestId("reactive-nav-start-hour-inc").click();
		await page.waitForTimeout(250);
		await page.getByTestId("reactive-nav-start-hour-dec").click();
		await page.waitForTimeout(250);

		const parsedAfter = await readNumberByTestId(
			page,
			"reactive-counter-parsed-search"
		);
		expect(parsedAfter).toBeGreaterThanOrEqual(parsedBefore);

		await expect(
			page.getByTestId("reactive-counter-availability-opts")
		).toBeVisible();

		await page.screenshot({
			path: "test-results/reactive-chain-after-navigation.png",
			fullPage: true,
		});
	});
});
