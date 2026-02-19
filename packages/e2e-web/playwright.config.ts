import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:43173";
const serverURL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:43100";
const assistantURL =
	process.env.PLAYWRIGHT_ASSISTANT_URL ?? "http://localhost:43102";
const useManagedServers = process.env.PLAYWRIGHT_MANAGED_SERVERS !== "0";
const reuseExistingServers =
	!process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVERS !== "0";
const webServerCommand =
	process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "npm run dev:web:e2e:clean";
const backendServerCommand =
	process.env.PLAYWRIGHT_BACKEND_SERVER_COMMAND ??
	"npm run dev:infra:e2e:clean";

process.env.PLAYWRIGHT_BASE_URL ??= baseURL;
process.env.PLAYWRIGHT_SERVER_URL ??= serverURL;
process.env.PLAYWRIGHT_ASSISTANT_URL ??= assistantURL;
const workers = Number(
	process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? "1" : "2")
);

export default defineConfig({
	testDir: "./e2e",
	testIgnore: ["**/perf/**"],
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: Number.isFinite(workers) && workers > 0 ? workers : 1,
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
