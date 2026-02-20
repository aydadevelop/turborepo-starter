import { defineConfig, devices } from "@playwright/test";
import { getPlaywrightRuntimeEnv } from "./playwright.env";

const {
	baseURL,
	assistantURL,
	useManagedServers,
	reuseExistingServers,
	webServerCommand,
	backendServerCommand,
	workers,
} = getPlaywrightRuntimeEnv();

export default defineConfig({
	testDir: "./e2e",
	testIgnore: ["**/perf/**"],
	globalSetup: "./e2e/global-setup.ts",
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
		? [
				{
					command: webServerCommand,
					url: baseURL,
					reuseExistingServer: reuseExistingServers,
					timeout: 60_000,
				},
				{
					command: backendServerCommand,
					url: `${assistantURL}/health`,
					reuseExistingServer: reuseExistingServers,
					timeout: 120_000,
				},
			]
		: undefined,
});
