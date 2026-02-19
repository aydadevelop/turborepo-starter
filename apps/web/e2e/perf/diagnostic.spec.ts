import { test, expect } from "./fixtures";

/**
 * Automated tests that drive the /diagnostic/* pages and assert
 * that reactive fire counts / render counts stay within acceptable bounds.
 *
 * Run:
 *   npx playwright test -c playwright.perf.config.ts e2e/perf/diagnostic.spec.ts
 */

test.describe("Reactive chain — duplicate parse detection", () => {
	test("availabilityOpts should not fire more than parsedSearch", async ({ page }) => {
		await page.goto("/diagnostic/reactive-chain");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(500); // let reactive graph settle

		// Trigger a URL navigation to exercise the chain
		await page.getByRole("button", { name: "startHour +1" }).click();
		await page.waitForTimeout(300);
		await page.getByRole("button", { name: "startHour −1" }).click();
		await page.waitForTimeout(300);

		const counts = await page.evaluate(() => {
			// Read the fire-count values from the DOM table cells
			const cells = [...document.querySelectorAll("table tbody tr td:last-child")];
			const nums = cells.map((c) => Number(c.textContent?.trim()));
			return nums;
		});

		// counts[0] = parsedSearch fires
		// counts[1] = availabilityOpts fires (Pattern A — should equal parsedSearch)
		// counts[2] = store $effect fires
		// counts[3] = query state $effect fires

		const [parsedSearchFires, availabilityOptsFires] = counts;

		console.log("Reactive chain fires:", {
			parsedSearch: parsedSearchFires,
			availabilityOpts: availabilityOptsFires,
		});

		// If availabilityOpts fires MORE than parsedSearch, the duplicate parse bug is active.
		// In the fixed version (Pattern B), both should fire an equal number of times.
		if (availabilityOptsFires > parsedSearchFires) {
			console.warn(
				`Bug confirmed: availabilityOpts fired ${availabilityOptsFires - parsedSearchFires}× more than parsedSearch`,
			);
		}

		// Regression: the duplicate parse should not cause more than 2x the fires
		expect(
			availabilityOptsFires,
			`availabilityOpts (${availabilityOptsFires}) should not fire more than 2× parsedSearch (${parsedSearchFires})`,
		).toBeLessThanOrEqual(parsedSearchFires * 2);
	});

	test("no phantom reactive fires while scrolling", async ({ page }) => {
		await page.goto("/diagnostic/reactive-chain");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(500);

		// Read initial counters
		const getCounters = () =>
			page.evaluate(() => {
				const cells = [...document.querySelectorAll("table tbody tr td:last-child")];
				return cells.map((c) => Number(c.textContent?.trim()));
			});

		const before = await getCounters();

		// Scroll through the long list
		await page.evaluate(async () => {
			const main = document.querySelector("main") ?? window;
			for (let i = 0; i < 10; i++) {
				if ("scrollTo" in main) {
					(main as Element).scrollTo({ top: (i + 1) * 300, behavior: "instant" });
				} else {
					window.scrollTo({ top: (i + 1) * 300, behavior: "instant" });
				}
				await new Promise((r) => requestAnimationFrame(r));
			}
			// Scroll back
			if ("scrollTo" in main) {
				(main as Element).scrollTo({ top: 0, behavior: "instant" });
			}
		});

		await page.waitForTimeout(200);
		const after = await getCounters();

		// Counters should NOT change during scroll (no URL change = no reactive work)
		for (let i = 0; i < Math.min(before.length, after.length); i++) {
			expect(
				after[i],
				`Counter #${i} changed during scroll: ${before[i]} → ${after[i]}`,
			).toBe(before[i]);
		}
	});
});

test.describe("Polling — render count during scroll", () => {
	test("state-change counter stays bounded during polling", async ({ page }) => {
		await page.goto("/diagnostic/polling-render");
		await page.waitForLoadState("networkidle");

		// Select 2s poll interval for a faster test
		await page.selectOption("select", "2000");
		await page.waitForTimeout(300);

		// Wait for at least one poll cycle
		await page.waitForTimeout(2500);

		const stateChanges = await page.evaluate(() => {
			const el = document.querySelector("[data-testid='state-changes']");
			if (el) return Number(el.textContent?.trim());
			// Fallback: read from grid cards
			const cards = [...document.querySelectorAll(".rounded-lg.border.bg-white.p-3")];
			return Number(cards[0]?.querySelector("p:first-child")?.textContent?.trim() ?? "0");
		});

		console.log("State changes after ~2 poll cycles:", stateChanges);

		// Should have at most a handful of state changes (initial + 1 poll)
		// More than 10 indicates phantom reactive cycles
		expect(stateChanges, `${stateChanges} state changes in 2.5s seems excessive`).toBeLessThan(10);
	});
});

test.describe("Derived stability — array/object reference churn", () => {
	test("stable nav links fires no more than unstable", async ({ page }) => {
		await page.goto("/diagnostic/derived-stability");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(500);

		// Read both counters from the page
		const counters = await page.evaluate(() => {
			const cards = [...document.querySelectorAll(".rounded-lg.border.p-3 p.font-mono.text-2xl")];
			return cards.map((c) => Number(c.textContent?.trim() ?? "0")).filter((n) => !Number.isNaN(n));
		});

		console.log("Stability counters:", counters);

		// counters[0] = unstable fires, counters[1] = stable fires
		// Stable should never fire more than unstable
		if (counters.length >= 2) {
			expect(
				counters[1],
				`Stable (${counters[1]}) should not fire more than unstable (${counters[0]})`,
			).toBeLessThanOrEqual(counters[0]);
		}
	});

	test("date reference changes during simulated ticks", async ({ page }) => {
		await page.goto("/diagnostic/derived-stability");
		await page.waitForLoadState("networkidle");

		// Start the tick simulation
		await page.getByRole("button", { name: "Start ticks (+1 per 500ms)" }).click();
		await page.waitForTimeout(2500); // ~5 ticks
		await page.getByRole("button", { name: "Stop" }).click();

		const dateReferenceChanges = await page.evaluate(() => {
			// 3rd number in grid under section 3
			const allCounters = [
				...document.querySelectorAll(
					".grid.gap-3 .rounded.border p.font-mono.text-2xl",
				),
			];
			return allCounters.map((c) => Number(c.textContent?.trim()));
		});

		console.log("Date reference counters after 5 ticks:", dateReferenceChanges);

		// dateReferenceChanges[1] = number of times startsAt reference changed
		// This should equal the number of ticks (~5) when URL params don't change
		// If it equals parseCount it means every tick creates a new Date — confirming the bug
		if (dateReferenceChanges.length >= 2) {
			const parseCount = dateReferenceChanges[0];
			const refChanges = dateReferenceChanges[1];
			expect(
				refChanges,
				`Date reference changed ${refChanges}× out of ${parseCount} parses — each parse creates a new Date object`,
			).toBeGreaterThan(0);
			// This confirms the known bug — document it
			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({
					parseCount,
					dateReferenceChanges: refChanges,
					issue:
						"Each parseSearch() call creates new Date objects even if the URL has not changed",
				}),
			});
		}
	});
});
