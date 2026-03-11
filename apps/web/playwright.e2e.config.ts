import { defineConfig, devices } from "@playwright/test";
import { getE2ERuntimeEnv } from "./playwright.e2e.env";

// App-local Playwright remains only for heavyweight browser checks
// such as performance guardrails. Deployment-gate journeys live in
// packages/e2e-web, and fast UI/browser feedback in apps/web uses
// Vitest Browser Mode.
const {
	baseURL,
	useManagedServers,
	reuseExistingServers,
	webServerCommand,
	workers,
} = getE2ERuntimeEnv();

const isCi = Boolean(process.env.CI);

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: isCi,
	retries: isCi ? 2 : 0,
	workers,
	reporter: isCi
		? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
		: "line",
	expect: {
		timeout: 10_000,
	},
	use: {
		baseURL,
		trace: "on-first-retry",
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: useManagedServers
		? {
				command: webServerCommand,
				url: baseURL,
				reuseExistingServer: reuseExistingServers,
				timeout: 120_000,
				stdout: "pipe",
				stderr: "pipe",
			}
		: undefined,
});
