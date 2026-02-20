import { defineConfig, devices } from "@playwright/test";
import { getE2ERuntimeEnv } from "./playwright.e2e.env";

const {
	baseURL,
	useManagedServers,
	reuseExistingServers,
	webServerCommand,
	workers,
} = getE2ERuntimeEnv();

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers,
	reporter: "line",
	use: {
		baseURL,
		trace: "on-first-retry",
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
			}
		: undefined,
});
