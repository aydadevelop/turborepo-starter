import { test, expect } from "./fixtures";

/**
 * Lighthouse audits via playwright-lighthouse.
 *
 * Requires the Chrome remote debugging port (--remote-debugging-port=9222)
 * which is set in playwright.perf.config.ts launchOptions.
 *
 * Run:
 *   npx playwright test -c playwright.perf.config.ts e2e/perf/lighthouse.spec.ts
 *
 * Point at staging:
 *   PLAYWRIGHT_BASE_URL=https://stage.example.com npx playwright test -c playwright.perf.config.ts e2e/perf/lighthouse.spec.ts
 */

let playAudit: typeof import("playwright-lighthouse").playAudit;

test.beforeAll(async () => {
	try {
		const mod = await import("playwright-lighthouse");
		playAudit = mod.playAudit;
	} catch {
		// playwright-lighthouse not installed — tests will be skipped
	}
});

const routes = [
	{ path: "/", name: "Landing" },
	{ path: "/login", name: "Login" },
	{ path: "/boats", name: "Boats" },
] as const;

const thresholds = {
	performance: 70,
	accessibility: 85,
	"best-practices": 80,
	seo: 75,
};

for (const { path, name } of routes) {
	test.describe(`Lighthouse — ${name}`, () => {
		test(`scores meet thresholds`, async ({ page }, testInfo) => {
			if (!playAudit) {
				test.skip(true, "playwright-lighthouse not installed");
				return;
			}

			await page.goto(path);
			await page.waitForLoadState("networkidle");

			const audit = await playAudit({
				page,
				port: 9222,
				thresholds,
				config: {
					extends: "lighthouse:default",
					settings: {
						onlyCategories: [
							"performance",
							"accessibility",
							"best-practices",
							"seo",
						],
						// Desktop-like throttling for consistent local results
						throttling: {
							rttMs: 40,
							throughputKbps: 10240,
							cpuSlowdownMultiplier: 1,
							requestLatencyMs: 0,
							downloadThroughputKbps: 0,
							uploadThroughputKbps: 0,
						},
					},
				},
			});

			const scores = {
				performance: Math.round(
					(audit.lhr.categories.performance?.score ?? 0) * 100,
				),
				accessibility: Math.round(
					(audit.lhr.categories.accessibility?.score ?? 0) * 100,
				),
				bestPractices: Math.round(
					(audit.lhr.categories["best-practices"]?.score ?? 0) * 100,
				),
				seo: Math.round((audit.lhr.categories.seo?.score ?? 0) * 100),
			};

			console.log(`Lighthouse scores for ${path}:`, scores);

			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({ route: path, ...scores }),
			});

			// Attach full report JSON
			await testInfo.attach(`lighthouse-${name.toLowerCase()}`, {
				body: JSON.stringify(audit.lhr, null, 2),
				contentType: "application/json",
			});

			expect(
				scores.performance,
				`Performance score ${scores.performance} on ${path}`,
			).toBeGreaterThanOrEqual(thresholds.performance);

			expect(
				scores.accessibility,
				`Accessibility score ${scores.accessibility} on ${path}`,
			).toBeGreaterThanOrEqual(thresholds.accessibility);

			expect(
				scores.bestPractices,
				`Best Practices score ${scores.bestPractices} on ${path}`,
			).toBeGreaterThanOrEqual(thresholds["best-practices"]);

			expect(
				scores.seo,
				`SEO score ${scores.seo} on ${path}`,
			).toBeGreaterThanOrEqual(thresholds.seo);
		});

		test(`bundle sizes via Lighthouse`, async ({ page }, testInfo) => {
			if (!playAudit) {
				test.skip(true, "playwright-lighthouse not installed");
				return;
			}

			await page.goto(path);
			await page.waitForLoadState("networkidle");

			const audit = await playAudit({
				page,
				port: 9222,
				thresholds: { performance: 0 },
				config: {
					extends: "lighthouse:default",
					settings: {
						onlyAudits: [
							"total-byte-weight",
							"unminified-javascript",
							"unminified-css",
							"unused-javascript",
							"unused-css-rules",
							"render-blocking-resources",
							"network-requests",
						],
					},
				},
			});

			const getNumericValue = (id: string) =>
				audit.lhr.audits[id]?.numericValue ?? null;

			const bundleInfo = {
				totalByteWeight: getNumericValue("total-byte-weight"),
				unusedJavascript: getNumericValue("unused-javascript"),
				unusedCss: getNumericValue("unused-css-rules"),
				renderBlockingResources: getNumericValue("render-blocking-resources"),
			};

			console.log(`Bundle analysis for ${path}:`, {
				totalKB: bundleInfo.totalByteWeight
					? Math.round(bundleInfo.totalByteWeight / 1024)
					: "N/A",
				unusedJsKB: bundleInfo.unusedJavascript
					? Math.round(bundleInfo.unusedJavascript / 1024)
					: "N/A",
				unusedCssKB: bundleInfo.unusedCss
					? Math.round(bundleInfo.unusedCss / 1024)
					: "N/A",
				renderBlockingMs: bundleInfo.renderBlockingResources ?? "N/A",
			});

			test.info().annotations.push({
				type: "performance",
				description: JSON.stringify({ route: path, ...bundleInfo }),
			});

			await testInfo.attach(`bundle-${name.toLowerCase()}`, {
				body: JSON.stringify(
					{
						totalByteWeight: audit.lhr.audits["total-byte-weight"],
						unusedJs: audit.lhr.audits["unused-javascript"],
						unusedCss: audit.lhr.audits["unused-css-rules"],
						renderBlocking: audit.lhr.audits["render-blocking-resources"],
						networkRequests: audit.lhr.audits["network-requests"],
					},
					null,
					2,
				),
				contentType: "application/json",
			});

			// Total page weight should be under 3 MB
			if (bundleInfo.totalByteWeight !== null) {
				expect(
					bundleInfo.totalByteWeight,
					`Total weight ${Math.round(bundleInfo.totalByteWeight / 1024)} KB on ${path}`,
				).toBeLessThan(3_000_000);
			}
		});
	});
}
