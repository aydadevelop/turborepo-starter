import { defineConfig, devices } from "@playwright/test";

const widgetURL = process.env.PLAYWRIGHT_WIDGET_URL ?? "http://localhost:4174";
const siteURL = process.env.PLAYWRIGHT_SITE_URL ?? "http://localhost:43275";
const serverURL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:43110";
const isCi = Boolean(process.env.CI);
const useManagedServers = process.env.PLAYWRIGHT_MANAGED_SERVERS !== "0";
const reuseExistingServers =
	!isCi && process.env.PLAYWRIGHT_REUSE_SERVERS !== "0";

process.env.PLAYWRIGHT_WIDGET_URL = widgetURL;
process.env.PLAYWRIGHT_SITE_URL = siteURL;
process.env.PLAYWRIGHT_SERVER_URL = serverURL;
process.env.PLAYWRIGHT_BASE_URL = widgetURL;

const webServerTimeout = isCi ? 240_000 : 180_000;

export default defineConfig({
	testDir: "./e2e",
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: false,
	forbidOnly: isCi,
	retries: isCi ? 2 : 0,
	reporter: isCi
		? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
		: "line",
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL: widgetURL,
		trace: "on-first-retry",
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: useManagedServers
		? [
				{
					command: `PLAYWRIGHT_BASE_URL=${widgetURL} PLAYWRIGHT_SERVER_PORT=43110 PLAYWRIGHT_SERVER_URL=${serverURL} node ../../scripts/e2e-start-services.mjs --ensure-db --service server`,
					url: `${serverURL}/health`,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
				{
					command: `PUBLIC_SERVER_URL=${serverURL} bun run dev:e2e`,
					url: `${widgetURL}/health`,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
				{
					command: `PUBLIC_WIDGET_URL=${widgetURL} bun run --cwd ../site-astro dev:e2e`,
					url: siteURL,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
			]
		: undefined,
});
