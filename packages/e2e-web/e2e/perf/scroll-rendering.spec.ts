import { expect, test } from "./fixtures";

/**
 * Scroll and rendering performance tests.
 *
 * Targets the scroll janking issue — detects excessive re-renders,
 * dropped frames, and long tasks during scroll interactions.
 */

test.describe("Scroll & rendering performance", () => {
	const scrollablePages = ["/", "/boats", "/bookings"] as const;

	for (const route of scrollablePages) {
		test(`frame rate during scroll on ${route}`, async ({
			page,
			measureFrames,
		}) => {
			await page.goto(route);
			await page.waitForLoadState("networkidle");
			await page.waitForTimeout(500);

			const frames = await measureFrames(async () => {
				// Smooth scroll from top to bottom
				await page.evaluate(async () => {
					const step = window.innerHeight / 2;
					const maxScroll = document.body.scrollHeight;
					let y = 0;
					while (y < maxScroll) {
						y = Math.min(y + step, maxScroll);
						window.scrollTo({ top: y, behavior: "instant" });
						await new Promise((r) => requestAnimationFrame(r));
					}
				});
			}, 4000);

			console.log(`Scroll FPS on ${route}:`, frames);

			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({ route, ...frames }),
			});

			// Expect reasonable frame rate (>20 FPS average)
			expect(
				frames.fps,
				`FPS during scroll on ${route}: ${frames.fps}`
			).toBeGreaterThan(20);

			// No more than 30% dropped frames
			expect(
				frames.droppedFramePercent,
				`${frames.droppedFramePercent}% dropped frames on ${route}`
			).toBeLessThan(30);
		});
	}

	test("long tasks during scroll on /boats", async ({ page }) => {
		await page.goto("/boats");
		await page.waitForLoadState("networkidle");

		// Start observing long tasks
		await page.evaluate(() => {
			const win = window as Record<string, unknown>;
			win.__longTasks = [] as { duration: number; startTime: number }[];
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					(win.__longTasks as { duration: number; startTime: number }[]).push({
						duration: entry.duration,
						startTime: entry.startTime,
					});
				}
			}).observe({ type: "longtask", buffered: true });
		});

		// Perform scroll
		await page.evaluate(async () => {
			const step = window.innerHeight / 3;
			const maxScroll = document.body.scrollHeight;
			let y = 0;
			while (y < maxScroll) {
				y = Math.min(y + step, maxScroll);
				window.scrollTo({ top: y, behavior: "instant" });
				await new Promise((r) => requestAnimationFrame(r));
			}
			// Scroll back up
			while (y > 0) {
				y = Math.max(y - step, 0);
				window.scrollTo({ top: y, behavior: "instant" });
				await new Promise((r) => requestAnimationFrame(r));
			}
		});

		await page.waitForTimeout(1000);

		const longTasks = await page.evaluate(
			() =>
				(window as Record<string, unknown>).__longTasks as {
					duration: number;
					startTime: number;
				}[]
		);

		console.log(
			`Long tasks during scroll: ${longTasks.length}`,
			longTasks.map((t) => `${t.duration.toFixed(0)}ms`)
		);

		test.info().annotations.push({
			type: "performance",
			description: JSON.stringify({
				longTaskCount: longTasks.length,
				maxDurationMs: longTasks.length
					? Math.max(...longTasks.map((t) => t.duration))
					: 0,
				totalBlockingMs: longTasks.reduce((s, t) => s + (t.duration - 50), 0),
			}),
		});

		// No long task should exceed 200ms during scroll
		for (const task of longTasks) {
			expect(
				task.duration,
				`Long task of ${task.duration.toFixed(0)}ms during scroll`
			).toBeLessThan(200);
		}
	});

	test("re-render detection during scroll", async ({ page }) => {
		await page.goto("/boats");
		await page.waitForLoadState("networkidle");

		// Patch requestAnimationFrame to count renders
		await page.evaluate(() => {
			const win = window as Record<string, unknown>;
			win.__renderCount = 0;

			// Use MutationObserver to detect DOM mutations (proxy for re-renders)
			const observer = new MutationObserver((mutations) => {
				(win.__renderCount as number) += mutations.length;
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
			});
			win.__mutationObserver = observer;
		});

		const beforeCount = await page.evaluate(
			() => (window as Record<string, unknown>).__renderCount as number
		);

		// Perform 5 scroll cycles
		for (let i = 0; i < 5; i++) {
			await page.evaluate(() =>
				window.scrollTo({
					top: document.body.scrollHeight,
					behavior: "instant",
				})
			);
			await page.waitForTimeout(200);
			await page.evaluate(() =>
				window.scrollTo({ top: 0, behavior: "instant" })
			);
			await page.waitForTimeout(200);
		}

		const afterCount = await page.evaluate(
			() => (window as Record<string, unknown>).__renderCount as number
		);

		const mutations = afterCount - beforeCount;

		// Cleanup
		await page.evaluate(() => {
			const win = window as Record<string, unknown>;
			(win.__mutationObserver as MutationObserver)?.disconnect();
		});

		console.log(`DOM mutations during 5 scroll cycles: ${mutations}`);

		test.info().annotations.push({
			type: "performance",
			description: JSON.stringify({ scrollCycles: 5, domMutations: mutations }),
		});

		// Scrolling should NOT cause massive re-renders.
		// Threshold is generous — if you're seeing jank, this number will be very high.
		expect(
			mutations,
			`${mutations} DOM mutations during scroll — excessive re-rendering`
		).toBeLessThan(500);
	});

	test("CSS paint timing during interaction", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Capture paint entries after interaction
		await page.evaluate(() => {
			const win = window as Record<string, unknown>;
			win.__paints = [] as string[];
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					(win.__paints as string[]).push(
						`${entry.name}: ${entry.startTime.toFixed(0)}ms`
					);
				}
			}).observe({ type: "paint", buffered: true });
		});

		const paints = await page.evaluate(
			() => (window as Record<string, unknown>).__paints as string[]
		);

		console.log("Paint events:", paints);

		// FCP should have fired
		expect(paints.some((p) => p.startsWith("first-contentful-paint"))).toBe(
			true
		);
	});
});
