import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const readNumberByTestId = async (
	page: Page,
	testId: string
): Promise<number> => {
	const raw = await page.getByTestId(testId).first().textContent();
	return Number((raw ?? "0").replace(/[^\d.-]/g, ""));
};

test.describe("Reactive chain diagnostics", () => {
	test("navigation controls advance reactive counters", async ({ page }) => {
		await page.goto("/diagnostic/reactive-chain");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(500);

		const parsedBefore = await readNumberByTestId(
			page,
			"reactive-counter-parsed-search"
		);
		const availabilityBefore = await readNumberByTestId(
			page,
			"reactive-counter-availability-opts"
		);

		await page.getByTestId("reactive-nav-start-hour-inc").click();
		await page.waitForTimeout(300);
		await page.getByTestId("reactive-nav-start-hour-dec").click();
		await page.waitForTimeout(300);

		const parsedAfter = await readNumberByTestId(
			page,
			"reactive-counter-parsed-search"
		);
		const availabilityAfter = await readNumberByTestId(
			page,
			"reactive-counter-availability-opts"
		);

		expect(parsedAfter).toBeGreaterThan(parsedBefore);
		expect(availabilityAfter).toBeGreaterThanOrEqual(availabilityBefore);
	});

	test("scroll-only interaction keeps reactive counters stable", async ({
		page,
	}) => {
		await page.goto("/diagnostic/reactive-chain");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(500);

		const before = {
			parsed: await readNumberByTestId(page, "reactive-counter-parsed-search"),
			availability: await readNumberByTestId(
				page,
				"reactive-counter-availability-opts"
			),
			store: await readNumberByTestId(page, "reactive-counter-store"),
			query: await readNumberByTestId(page, "reactive-counter-query"),
		};

		await page.evaluate(async () => {
			for (let i = 0; i < 10; i++) {
				window.scrollTo({ top: (i + 1) * 300, behavior: "instant" });
				await new Promise((r) => requestAnimationFrame(r));
			}
			window.scrollTo({ top: 0, behavior: "instant" });
		});

		await page.waitForTimeout(200);

		const after = {
			parsed: await readNumberByTestId(page, "reactive-counter-parsed-search"),
			availability: await readNumberByTestId(
				page,
				"reactive-counter-availability-opts"
			),
			store: await readNumberByTestId(page, "reactive-counter-store"),
			query: await readNumberByTestId(page, "reactive-counter-query"),
		};

		expect(after).toEqual(before);
	});
});

test.describe("Polling diagnostics", () => {
	test("state-change counter stays bounded under polling", async ({
		page,
	}, testInfo) => {
		if (testInfo.project.name === "perf-mobile") {
			test.skip(true, "Polling diagnostic is currently unstable on mobile profile");
		}

		await page.goto("/diagnostic/polling-render");
		await page.waitForLoadState("networkidle");

		await page.getByTestId("poll-interval-select").selectOption("2000");
		await page.waitForTimeout(300);
		await page.waitForTimeout(2500);

		const stateChanges = await readNumberByTestId(page, "state-changes");
		expect(stateChanges).toBeGreaterThan(0);
		expect(stateChanges).toBeLessThan(10);
	});
});
