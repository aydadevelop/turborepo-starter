import { expect, type Page, test } from "@playwright/test";
import { goto } from "./utils/setup";

const MB = 1024 * 1024;
const MAX_HEAP_GROWTH_MULTIPLIER = 2.5;
const MAX_HEAP_GROWTH_ABSOLUTE_MB = 8;

const readHeap = async (page: Page) =>
	await page.evaluate(() => {
		const perf = performance as Performance & {
			memory?: {
				usedJSHeapSize?: number;
			};
		};
		if (typeof perf.memory?.usedJSHeapSize !== "number") {
			return null;
		}
		return perf.memory.usedJSHeapSize;
	});

test.describe("Performance Guardrails", () => {
	test("route transitions do not cause unbounded heap growth", async ({
		page,
		browserName,
	}) => {
		test.setTimeout(90_000);
		test.skip(browserName !== "chromium", "Heap metrics are chromium-only.");

		await goto(page, "/");
		const initialHeap = await readHeap(page);
		if (initialHeap === null) {
			test.skip(true, "performance.memory is unavailable.");
			return;
		}

		const routes = [
			"/",
			"/login",
			"/org/create?reason=required",
			"/dashboard/settings",
		];
		for (let i = 0; i < 12; i++) {
			const route = routes[i % routes.length];
			await page.goto(route, { waitUntil: "domcontentloaded" });
			await page.waitForTimeout(100);
		}

		const finalHeap = await readHeap(page);
		if (finalHeap === null) {
			test.skip(true, "performance.memory became unavailable.");
			return;
		}

		const maxAllowedHeap =
			initialHeap * MAX_HEAP_GROWTH_MULTIPLIER +
			MAX_HEAP_GROWTH_ABSOLUTE_MB * MB;

		expect(finalHeap).toBeLessThanOrEqual(maxAllowedHeap);
	});
});
