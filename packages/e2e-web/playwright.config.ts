import { defineConfig, devices } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "./playwright.env";

// Deployment-gate E2E suite with hardened, cross-service user stories.
const {
	baseURL,
	serverURL,
	assistantURL,
	notificationsURL,
	siteURL,
	useManagedServers,
	reuseExistingServers,
	webServerCommand,
	serverCommand,
	assistantCommand,
	notificationsCommand,
	workers,
} = getPlaywrightRuntimeEnv();

const isCi = Boolean(process.env.CI);
const webServerTimeout = isCi ? 240_000 : 180_000;

export default defineConfig({
	testDir: "./e2e",
	testIgnore: ["**/perf/**"],
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: false,
	forbidOnly: isCi,
	retries: isCi ? 2 : 0,
	workers,
	reporter: isCi
		? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
		: "line",
	expect: {
		// Global assertion timeout — how long to wait for expect() matchers.
		timeout: 10_000,
	},
	use: {
		baseURL,
		trace: "on-first-retry",
		// How long a single page.click() / page.fill() etc. is allowed to take.
		actionTimeout: 15_000,
		// How long page.goto() / page.waitForNavigation() is allowed to take.
		navigationTimeout: 30_000,
	},
	projects: [
		{
			name: "setup",
			testMatch: /auth\.setup\.ts/,
		},
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			dependencies: ["setup"],
		},
	],
	webServer: useManagedServers
		? [
				{
					command: webServerCommand,
					url: baseURL,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
				{
					command: serverCommand,
					url: `${serverURL}/health`,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
				{
					command: assistantCommand,
					url: `${assistantURL}/health`,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
				{
					command: notificationsCommand,
					url: `${notificationsURL}/health`,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
				{
					command: "bun run --cwd ../../apps/site-astro dev:e2e",
					url: siteURL,
					reuseExistingServer: reuseExistingServers,
					timeout: webServerTimeout,
					stdout: "pipe",
					stderr: "pipe",
				},
			]
		: undefined,
});
