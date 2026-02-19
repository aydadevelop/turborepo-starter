import { defineConfig, devices } from "@playwright/test";

/**
 * Performance-specific Playwright configuration.
 *
 * Runs against a local dev server by default.
 * Override PLAYWRIGHT_BASE_URL to point at a staging domain:
 *
 *   PLAYWRIGHT_BASE_URL=https://stage.example.com npx playwright test -c playwright.perf.config.ts
 *
 * Chrome-specific flags are enabled for:
 *  - performance.memory API (--enable-precise-memory-info)
 *  - remote debugging port for Lighthouse (--remote-debugging-port=9222)
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:43173";
const serverURL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:43100";
const assistantURL =
	process.env.PLAYWRIGHT_ASSISTANT_URL ?? "http://localhost:43102";

process.env.PLAYWRIGHT_BASE_URL ??= baseURL;
process.env.PLAYWRIGHT_SERVER_URL ??= serverURL;
process.env.PLAYWRIGHT_ASSISTANT_URL ??= assistantURL;

const isRemote = !baseURL.includes("localhost");

export default defineConfig({
	testDir: "./e2e/perf",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: 1,
	reporter: [["html", { outputFolder: "playwright-report/perf" }], ["list"]],
	timeout: 120_000,
	use: {
		baseURL,
		trace: "retain-on-failure",
		video: "retain-on-failure",
		launchOptions: {
			args: [
				"--enable-precise-memory-info",
				"--js-flags=--expose-gc",
				"--remote-debugging-port=9222",
				"--no-sandbox",
			],
		},
	},
	projects: [
		{
			name: "perf-chromium",
			use: {
				...devices["Desktop Chrome"],
				// Consistent viewport for CLS measurement
				viewport: { width: 1280, height: 720 },
			},
		},
		{
			name: "perf-mobile",
			use: {
				...devices["Pixel 5"],
			},
		},
	],
	...(isRemote
		? {}
		: {
				webServer: [
					{
						command:
							process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
							"npm run dev:web:e2e:clean",
						url: baseURL,
						reuseExistingServer: true,
						timeout: 120_000,
					},
					{
						command:
							process.env.PLAYWRIGHT_BACKEND_SERVER_COMMAND ??
							"npm run dev:infra:e2e:clean",
						url: `${assistantURL}/health`,
						reuseExistingServer: true,
						timeout: 120_000,
					},
				],
			}),
});
