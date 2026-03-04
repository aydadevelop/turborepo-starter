import { defineConfig, devices } from "@playwright/test";
import { getE2ERuntimeEnv } from "./playwright.e2e.env";

// Dev-only browser checks for local progress validation.
// Deployment gate stories live in packages/e2e-web.
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
