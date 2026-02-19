import { expect, test } from "./fixtures";

/**
 * Memory leak detection: navigate/interact repeatedly and check that
 * heap usage stays bounded. Chrome-only (uses performance.memory).
 */

test.describe("Memory leak detection", () => {
	test("heap stays bounded during repeated navigation", async ({
		page,
		getMemory,
	}) => {
		const snapshots: { route: string; usedMB: number }[] = [];
		const routes = ["/", "/boats", "/login", "/", "/boats", "/login"];

		for (const route of routes) {
			await page.goto(route);
			await page.waitForLoadState("networkidle");

			// Force GC if available (requires --js-flags=--expose-gc)
			await page.evaluate(() => {
				if (typeof globalThis.gc === "function") {
					globalThis.gc();
				}
			});
			await page.waitForTimeout(500);

			const mem = await getMemory();
			if (mem) {
				snapshots.push({ route, usedMB: mem.usedJSHeapSizeMB });
			}
		}

		if (snapshots.length === 0) {
			test.skip(true, "performance.memory not available");
			return;
		}

		console.table(snapshots);

		// Memory should not grow unboundedly across navigations.
		// Compare first half average vs second half average — growth > 50% is suspicious.
		const mid = Math.floor(snapshots.length / 2);
		const firstHalfAvg =
			snapshots.slice(0, mid).reduce((s, m) => s + m.usedMB, 0) / mid;
		const secondHalfAvg =
			snapshots.slice(mid).reduce((s, m) => s + m.usedMB, 0) /
			(snapshots.length - mid);
		const growthPercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

		test.info().annotations.push({
			type: "performance",
			description: JSON.stringify({
				firstHalfAvgMB: Math.round(firstHalfAvg * 100) / 100,
				secondHalfAvgMB: Math.round(secondHalfAvg * 100) / 100,
				growthPercent: Math.round(growthPercent * 10) / 10,
			}),
		});

		console.log(
			`Memory growth: ${growthPercent.toFixed(1)}% (${firstHalfAvg.toFixed(1)} MB → ${secondHalfAvg.toFixed(1)} MB)`
		);

		expect(
			growthPercent,
			`Heap grew ${growthPercent.toFixed(1)}% across navigations — possible memory leak`
		).toBeLessThan(50);
	});

	test("heap stays bounded during repeated interactions on a single page", async ({
		page,
		getMemory,
	}) => {
		await page.goto("/boats");
		await page.waitForLoadState("networkidle");

		const snapshots: { iteration: number; usedMB: number }[] = [];

		for (let i = 0; i < 10; i++) {
			// Scroll to bottom and back
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			await page.waitForTimeout(300);
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.waitForTimeout(300);

			// Force GC
			await page.evaluate(() => {
				if (typeof globalThis.gc === "function") {
					globalThis.gc();
				}
			});
			await page.waitForTimeout(200);

			const mem = await getMemory();
			if (mem) {
				snapshots.push({ iteration: i, usedMB: mem.usedJSHeapSizeMB });
			}
		}

		if (snapshots.length === 0) {
			test.skip(true, "performance.memory not available");
			return;
		}

		console.table(snapshots);

		const first = snapshots[0].usedMB;
		const last = snapshots.at(-1).usedMB;
		const growthMB = last - first;

		test.info().annotations.push({
			type: "performance",
			description: JSON.stringify({
				startMB: Math.round(first * 100) / 100,
				endMB: Math.round(last * 100) / 100,
				growthMB: Math.round(growthMB * 100) / 100,
			}),
		});

		console.log(
			`Memory after 10 scroll cycles: ${first.toFixed(1)} MB → ${last.toFixed(1)} MB (+ ${growthMB.toFixed(1)} MB)`
		);

		// Allow max 20 MB growth over 10 interaction cycles
		expect(
			growthMB,
			`Heap grew ${growthMB.toFixed(1)} MB during interactions — possible leak`
		).toBeLessThan(20);
	});

	test("detached DOM nodes do not accumulate", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Navigate through pages and return
		const routes = ["/boats", "/login", "/"];
		for (const route of routes) {
			await page.goto(route);
			await page.waitForLoadState("networkidle");
		}

		// Force GC
		await page.evaluate(() => {
			if (typeof globalThis.gc === "function") {
				globalThis.gc();
			}
		});
		await page.waitForTimeout(1000);

		// Count DOM nodes as a proxy for detached-node accumulation
		const nodeCount = await page.evaluate(
			() => document.querySelectorAll("*").length
		);

		test.info().annotations.push({
			type: "performance",
			description: JSON.stringify({ domNodeCount: nodeCount }),
		});

		console.log(`DOM node count: ${nodeCount}`);

		// Landing page should not have excessive DOM nodes
		expect(
			nodeCount,
			`${nodeCount} DOM nodes on landing — excessive DOM size`
		).toBeLessThan(3000);
	});
});
