import { test, expect } from "./fixtures";

const publicPages = ["/", "/login", "/boats"] as const;

for (const route of publicPages) {
	test.describe(`Web Vitals — ${route}`, () => {
		test(`LCP, CLS, FCP within budget`, async ({
			page,
			injectVitals,
			getVitals,
			budgetFor,
		}) => {
			const budget = budgetFor(route);

			await injectVitals();
			await page.goto(route);
			await page.waitForLoadState("networkidle");

			// Give CLS/LCP observers time to settle
			await page.waitForTimeout(1500);

			const vitals = await getVitals();

			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({ route, ...vitals }),
			});

			if (vitals.lcp !== null) {
				expect(vitals.lcp, `LCP on ${route}`).toBeLessThan(budget.lcp);
			}
			if (vitals.cls !== null) {
				expect(vitals.cls, `CLS on ${route}`).toBeLessThan(budget.cls);
			}
			if (vitals.fcp !== null) {
				expect(vitals.fcp, `FCP on ${route}`).toBeLessThan(budget.fcp);
			}
		});

		test(`navigation timing within budget`, async ({
			page,
			getNavigation,
			budgetFor,
		}) => {
			const budget = budgetFor(route);

			await page.goto(route);
			await page.waitForLoadState("load");

			const nav = await getNavigation();

			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({ route, ...nav }),
			});

			expect(nav.ttfb, `TTFB on ${route}`).toBeLessThan(budget.ttfb);
			expect(nav.domContentLoaded, `DCL on ${route}`).toBeLessThan(4000);
			expect(nav.loadComplete, `Load on ${route}`).toBeLessThan(8000);
		});

		test(`resource sizes within budget`, async ({
			page,
			getResources,
			budgetFor,
		}) => {
			const budget = budgetFor(route);

			await page.goto(route);
			await page.waitForLoadState("networkidle");

			const res = await getResources();

			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({
					route,
					totalSizeKB: Math.round(res.totalSize / 1024),
					jsSizeKB: Math.round(res.jsSize / 1024),
					resourceCount: res.resourceCount,
				}),
			});

			expect(res.totalSize, `Total size on ${route}`).toBeLessThan(
				budget.totalSize,
			);
			expect(res.jsSize, `JS size on ${route}`).toBeLessThan(budget.jsSize);

			if (res.slowResources.length > 0) {
				console.warn(`Slow resources on ${route}:`, res.slowResources);
			}
		});
	});
}
